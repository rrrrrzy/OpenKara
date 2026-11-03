import { create } from "zustand";
import { tauriBackend, type Backend, type Playlist } from "@/lib/backend";
import type { PlaylistSong } from "@/lib/backend";

interface PlaylistState {
  activeSongs: PlaylistSong[];
  songsLoading: boolean;
  isSavingOrder: boolean;
  isReplacingQueue: boolean;
  loadActiveSongs: () => Promise<void>;
  reorderPlaylistSongs: (songHashes: string[]) => Promise<void>;
  replacePlaylistQueue: (
    replace: (hashes: string[]) => void,
  ) => Promise<{ count: number; skipped: number } | null>;
  playlists: Playlist[];
  activePlaylistId: string | null;
  isLoading: boolean;
  playlistSongSets: Map<string, Set<string>>;

  loadPlaylists: () => Promise<void>;
  loadPlaylistSongSets: () => Promise<void>;
  createPlaylist: (name: string) => Promise<Playlist>;
  renamePlaylist: (playlistId: string, name: string) => Promise<void>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  addSongsToPlaylist: (
    playlistId: string,
    songHashes: string[],
  ) => Promise<void>;
  removeSongsFromPlaylist: (
    playlistId: string,
    songHashes: string[],
  ) => Promise<void>;
  getPlaylistSongs: (playlistId: string) => Promise<PlaylistSong[]>;
  setActivePlaylist: (playlistId: string | null) => void;
}

export function createPlaylistStore(backend: Backend = tauriBackend) {
  const api = backend.playlist;

  let request = 0;
  let pendingOrder: Promise<void> | null = null;

  return create<PlaylistState>((set, get) => ({
    activeSongs: [],
    songsLoading: false,
    isSavingOrder: false,
    isReplacingQueue: false,
    loadActiveSongs: async () => {
      const id = get().activePlaylistId;
      const token = ++request;
      if (!id) return;
      set({ songsLoading: true });
      try {
        if (pendingOrder) await pendingOrder.catch(() => {});
        if (token !== request) return;
        const activeSongs = await api.getPlaylistSongs(id);
        if (token === request) set({ activeSongs });
      } finally {
        if (token === request) set({ songsLoading: false });
      }
    },
    reorderPlaylistSongs: async (songHashes) => {
      const state = get();
      const id = state.activePlaylistId;
      if (
        !id ||
        state.songsLoading ||
        state.isSavingOrder ||
        state.isReplacingQueue
      )
        return;
      const before = state.activeSongs;
      const byHash = new Map(before.map((entry) => [entry.song_hash, entry]));
      if (
        songHashes.length !== before.length ||
        new Set(songHashes).size !== before.length ||
        songHashes.some((hash) => !byHash.has(hash))
      ) {
        throw new Error("Invalid playlist order");
      }
      const token = ++request;
      set({
        isSavingOrder: true,
        activeSongs: songHashes.map((hash, sort_order) => ({
          ...byHash.get(hash)!,
          sort_order,
        })),
      });
      try {
        pendingOrder = api.reorderPlaylistSongs(id, songHashes);
        await pendingOrder;
      } catch (error) {
        if (token === request) set({ activeSongs: before });
        throw error;
      } finally {
        pendingOrder = null;
        set({ isSavingOrder: false });
      }
    },
    replacePlaylistQueue: async (replace) => {
      const state = get();
      const id = state.activePlaylistId;
      if (
        !id ||
        state.songsLoading ||
        state.isSavingOrder ||
        state.isReplacingQueue
      )
        return null;
      const token = ++request;
      set({ isReplacingQueue: true });
      try {
        const [entries, songs] = await Promise.all([
          api.getPlaylistSongs(id),
          backend.library.getLibrary(),
        ]);
        if (token !== request) return null;
        const availableHashes = new Set(songs.map((song) => song.hash));
        const hashes = entries
          .map((entry) => entry.song_hash)
          .filter((hash) => availableHashes.has(hash));
        if (hashes.length > 0) replace(hashes);
        return {
          count: hashes.length,
          skipped: entries.length - hashes.length,
        };
      } finally {
        set({ isReplacingQueue: false });
      }
    },
    playlists: [],
    activePlaylistId: null,
    isLoading: false,
    playlistSongSets: new Map(),

    loadPlaylists: async () => {
      set({ isLoading: true });
      try {
        const playlists = await api.listPlaylists();
        set({ playlists, isLoading: false });
        await get().loadPlaylistSongSets();
      } catch {
        set({ isLoading: false });
      }
    },

    loadPlaylistSongSets: async () => {
      const { playlists } = get();
      const sets = new Map<string, Set<string>>();
      for (const p of playlists) {
        const songs = await api.getPlaylistSongs(p.id);
        sets.set(p.id, new Set(songs.map((s) => s.song_hash)));
      }
      set({ playlistSongSets: sets });
    },

    createPlaylist: async (name: string) => {
      const playlist = await api.createPlaylist(name);
      await get().loadPlaylists();
      return playlist;
    },

    renamePlaylist: async (playlistId: string, name: string) => {
      await api.renamePlaylist(playlistId, name);
      set((state) => ({
        playlists: state.playlists.map((p) =>
          p.id === playlistId ? { ...p, name } : p,
        ),
      }));
    },

    deletePlaylist: async (playlistId: string) => {
      await api.deletePlaylist(playlistId);
      if (get().activePlaylistId === playlistId) get().setActivePlaylist(null);
      await get().loadPlaylists();
    },

    addSongsToPlaylist: async (playlistId, songHashes) => {
      await api.addSongsToPlaylist(playlistId, songHashes);
      await get().loadPlaylists();
    },

    removeSongsFromPlaylist: async (playlistId, songHashes) => {
      await api.removeSongsFromPlaylist(playlistId, songHashes);
      await get().loadPlaylists();
    },

    getPlaylistSongs: async (playlistId) => {
      return api.getPlaylistSongs(playlistId);
    },

    setActivePlaylist: (playlistId) => {
      if (get().activePlaylistId === playlistId) return;
      ++request;
      set({
        activePlaylistId: playlistId,
        activeSongs: [],
        songsLoading: !!playlistId,
      });
    },
  }));
}

export const usePlaylistStore = createPlaylistStore();
