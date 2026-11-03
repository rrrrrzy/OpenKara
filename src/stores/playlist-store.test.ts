import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { PREVIEW_SONGS } from "@/mock/preview-songs";
import { createMockBackend } from "@/lib/backend/mock-backend";
import { createPlaylistStore } from "./playlist-store";

const mockListPlaylists = vi.fn();
const mockCreatePlaylist = vi.fn();
const mockRenamePlaylist = vi.fn();
const mockDeletePlaylist = vi.fn();
const mockAddSongsToPlaylist = vi.fn();
const mockRemoveSongsFromPlaylist = vi.fn();
const mockGetPlaylistSongs = vi.fn();

const usePlaylistStore = createPlaylistStore(
  createMockBackend({
    overrides: {
      playlist: {
        listPlaylists: mockListPlaylists,
        createPlaylist: mockCreatePlaylist,
        renamePlaylist: mockRenamePlaylist,
        deletePlaylist: mockDeletePlaylist,
        addSongsToPlaylist: mockAddSongsToPlaylist,
        removeSongsFromPlaylist: mockRemoveSongsFromPlaylist,
        getPlaylistSongs: mockGetPlaylistSongs,
      },
    },
  }),
);

const mockPlaylists = [
  {
    id: "pl-1",
    name: "Favourites",
    song_count: 2,
    created_at: 1000,
    updated_at: 2000,
  },
  {
    id: "pl-2",
    name: "Party",
    song_count: 0,
    created_at: 3000,
    updated_at: 3000,
  },
];

const mockSongs = [
  { song_hash: "s1", added_at: 1000, sort_order: 0, singer: null },
  { song_hash: "s2", added_at: 1000, sort_order: 1, singer: "Alice" },
];

describe("playlist-store", () => {
  beforeEach(() => {
    mockListPlaylists.mockReset();
    mockCreatePlaylist.mockReset();
    mockRenamePlaylist.mockReset();
    mockDeletePlaylist.mockReset();
    mockAddSongsToPlaylist.mockReset();
    mockRemoveSongsFromPlaylist.mockReset();
    mockGetPlaylistSongs.mockReset();

    usePlaylistStore.setState({
      playlists: [],
      activePlaylistId: null,
      isLoading: false,
      playlistSongSets: new Map(),
    });
  });

  describe("loadPlaylists", () => {
    test("fetches playlists and sets state", async () => {
      mockListPlaylists.mockResolvedValue(mockPlaylists);
      mockGetPlaylistSongs.mockResolvedValue([]);

      await usePlaylistStore.getState().loadPlaylists();

      const state = usePlaylistStore.getState();
      expect(state.playlists).toEqual(mockPlaylists);
      expect(state.isLoading).toBe(false);
    });

    test("sets isLoading during fetch", async () => {
      let resolveList: (v: unknown) => void;
      mockListPlaylists.mockReturnValue(new Promise((r) => (resolveList = r)));
      mockGetPlaylistSongs.mockResolvedValue([]);

      const promise = usePlaylistStore.getState().loadPlaylists();
      expect(usePlaylistStore.getState().isLoading).toBe(true);

      resolveList!(mockPlaylists);
      await promise;
      expect(usePlaylistStore.getState().isLoading).toBe(false);
    });

    test("sets isLoading false on error", async () => {
      mockListPlaylists.mockRejectedValue(new Error("fail"));

      await usePlaylistStore.getState().loadPlaylists();

      expect(usePlaylistStore.getState().isLoading).toBe(false);
      expect(usePlaylistStore.getState().playlists).toEqual([]);
    });

    test("populates playlistSongSets after loading", async () => {
      mockListPlaylists.mockResolvedValue(mockPlaylists);
      mockGetPlaylistSongs
        .mockResolvedValueOnce([mockSongs[0]])
        .mockResolvedValueOnce([]);

      await usePlaylistStore.getState().loadPlaylists();

      const sets = usePlaylistStore.getState().playlistSongSets;
      expect(sets.get("pl-1")).toEqual(new Set(["s1"]));
      expect(sets.get("pl-2")).toEqual(new Set());
    });
  });

  describe("createPlaylist", () => {
    test("calls API and reloads playlists", async () => {
      const newPlaylist = {
        id: "pl-new",
        name: "New",
        song_count: 0,
        created_at: 1,
        updated_at: 1,
      };
      mockCreatePlaylist.mockResolvedValue(newPlaylist);
      mockListPlaylists.mockResolvedValue([...mockPlaylists, newPlaylist]);
      mockGetPlaylistSongs.mockResolvedValue([]);

      const result = await usePlaylistStore.getState().createPlaylist("New");

      expect(mockCreatePlaylist).toHaveBeenCalledWith("New");
      expect(result).toEqual(newPlaylist);
      expect(usePlaylistStore.getState().playlists).toHaveLength(3);
    });
  });

  describe("renamePlaylist", () => {
    test("calls API and updates local state optimistically", async () => {
      mockRenamePlaylist.mockResolvedValue(undefined);
      usePlaylistStore.setState({ playlists: [...mockPlaylists] });

      await usePlaylistStore.getState().renamePlaylist("pl-1", "Renamed");

      expect(mockRenamePlaylist).toHaveBeenCalledWith("pl-1", "Renamed");
      const updated = usePlaylistStore
        .getState()
        .playlists.find((p) => p.id === "pl-1");
      expect(updated?.name).toBe("Renamed");
      const other = usePlaylistStore
        .getState()
        .playlists.find((p) => p.id === "pl-2");
      expect(other?.name).toBe("Party");
    });
  });

  describe("deletePlaylist", () => {
    test("calls API, clears activePlaylistId if it was the deleted one, and reloads", async () => {
      mockDeletePlaylist.mockResolvedValue(undefined);
      mockListPlaylists.mockResolvedValue([mockPlaylists[1]]);
      mockGetPlaylistSongs.mockResolvedValue([]);

      usePlaylistStore.setState({
        playlists: [...mockPlaylists],
        activePlaylistId: "pl-1",
      });

      await usePlaylistStore.getState().deletePlaylist("pl-1");

      expect(mockDeletePlaylist).toHaveBeenCalledWith("pl-1");
      expect(usePlaylistStore.getState().activePlaylistId).toBeNull();
    });

    test("keeps activePlaylistId if it was a different playlist", async () => {
      mockDeletePlaylist.mockResolvedValue(undefined);
      mockListPlaylists.mockResolvedValue([mockPlaylists[0]]);
      mockGetPlaylistSongs.mockResolvedValue([]);

      usePlaylistStore.setState({
        playlists: [...mockPlaylists],
        activePlaylistId: "pl-2",
      });

      await usePlaylistStore.getState().deletePlaylist("pl-1");

      expect(usePlaylistStore.getState().activePlaylistId).toBe("pl-2");
    });
  });

  describe("addSongsToPlaylist", () => {
    test("calls API and reloads playlists", async () => {
      mockAddSongsToPlaylist.mockResolvedValue(undefined);
      mockListPlaylists.mockResolvedValue(mockPlaylists);
      mockGetPlaylistSongs.mockResolvedValue([]);

      await usePlaylistStore
        .getState()
        .addSongsToPlaylist("pl-1", ["s3", "s4"]);

      expect(mockAddSongsToPlaylist).toHaveBeenCalledWith("pl-1", ["s3", "s4"]);
      expect(mockListPlaylists).toHaveBeenCalled();
    });
  });

  describe("removeSongsFromPlaylist", () => {
    test("calls API and reloads playlists", async () => {
      mockRemoveSongsFromPlaylist.mockResolvedValue(undefined);
      mockListPlaylists.mockResolvedValue(mockPlaylists);
      mockGetPlaylistSongs.mockResolvedValue([]);

      await usePlaylistStore.getState().removeSongsFromPlaylist("pl-1", ["s1"]);

      expect(mockRemoveSongsFromPlaylist).toHaveBeenCalledWith("pl-1", ["s1"]);
      expect(mockListPlaylists).toHaveBeenCalled();
    });
  });

  describe("getPlaylistSongs", () => {
    test("returns songs from API", async () => {
      mockGetPlaylistSongs.mockResolvedValue(mockSongs);

      const result = await usePlaylistStore.getState().getPlaylistSongs("pl-1");

      expect(mockGetPlaylistSongs).toHaveBeenCalledWith("pl-1");
      expect(result).toEqual(mockSongs);
    });
  });

  describe("setActivePlaylist", () => {
    test("sets activePlaylistId", () => {
      usePlaylistStore.getState().setActivePlaylist("pl-1");
      expect(usePlaylistStore.getState().activePlaylistId).toBe("pl-1");
    });

    test("clears activePlaylistId with null", () => {
      usePlaylistStore.setState({ activePlaylistId: "pl-1" });
      usePlaylistStore.getState().setActivePlaylist(null);
      expect(usePlaylistStore.getState().activePlaylistId).toBeNull();
    });
  });

  describe("loadPlaylistSongSets", () => {
    test("builds set of song hashes per playlist", async () => {
      usePlaylistStore.setState({ playlists: mockPlaylists });
      mockGetPlaylistSongs
        .mockResolvedValueOnce([mockSongs[0], mockSongs[1]])
        .mockResolvedValueOnce([]);

      await usePlaylistStore.getState().loadPlaylistSongSets();

      const sets = usePlaylistStore.getState().playlistSongSets;
      expect(sets.get("pl-1")).toEqual(new Set(["s1", "s2"]));
      expect(sets.get("pl-2")).toEqual(new Set());
    });

    test("handles empty playlists list", async () => {
      usePlaylistStore.setState({ playlists: [] });

      await usePlaylistStore.getState().loadPlaylistSongSets();

      expect(usePlaylistStore.getState().playlistSongSets.size).toBe(0);
      expect(mockGetPlaylistSongs).not.toHaveBeenCalled();
    });
  });
});

describe("playlist ordering and queue replacement", () => {
  function setup() {
    const read = vi.fn(async () => mockSongs.map((song) => ({ ...song })));
    const save = vi.fn(async (_id: string, _hashes: string[]) => {});
    const librarySongs = mockSongs.map(({ song_hash }) => ({
      ...PREVIEW_SONGS[0],
      hash: song_hash,
    }));
    const readLibrary = vi.fn(async () => librarySongs);
    const store = createPlaylistStore(
      createMockBackend({
        overrides: {
          library: { getLibrary: readLibrary },
          playlist: {
            getPlaylistSongs: read,
            reorderPlaylistSongs: save,
          },
        },
      }),
    );
    store.getState().setActivePlaylist("pl-1");
    return { store, read, save, readLibrary };
  }

  test("saves optimistic order with metadata and blocks overlapping actions", async () => {
    const { store, save } = setup();
    await store.getState().loadActiveSongs();
    let finish!: () => void;
    save.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = store.getState().reorderPlaylistSongs(["s2", "s1"]);
    expect(
      store.getState().activeSongs.map((entry) => entry.song_hash),
    ).toEqual(["s2", "s1"]);
    expect(store.getState().activeSongs[0].singer).toBe("Alice");
    expect(store.getState().isSavingOrder).toBe(true);
    await store.getState().reorderPlaylistSongs(["s1", "s2"]);
    const replace = vi.fn();
    expect(await store.getState().replacePlaylistQueue(replace)).toBeNull();
    expect(save).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
    finish();
    await pending;
    expect(store.getState().isSavingOrder).toBe(false);
  });

  test("a refresh waits for an in-flight order save", async () => {
    const { store, read, save } = setup();
    await store.getState().loadActiveSongs();
    let finish!: () => void;
    save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const saving = store.getState().reorderPlaylistSongs(["s2", "s1"]);
    read.mockResolvedValueOnce([...mockSongs].reverse());
    const refreshing = store.getState().loadActiveSongs();
    expect(read).toHaveBeenCalledTimes(1);
    finish();
    await Promise.all([saving, refreshing]);
    expect(
      store.getState().activeSongs.map((entry) => entry.song_hash),
    ).toEqual(["s2", "s1"]);
    expect(store.getState().songsLoading).toBe(false);
  });

  test("selecting the active playlist keeps its loaded songs", async () => {
    const { store } = setup();
    await store.getState().loadActiveSongs();
    store.getState().setActivePlaylist("pl-1");
    expect(store.getState().activeSongs).toEqual(mockSongs);
    expect(store.getState().songsLoading).toBe(false);
  });

  test("failed save restores the original order", async () => {
    const { store, save } = setup();
    await store.getState().loadActiveSongs();
    save.mockRejectedValueOnce(new Error("disk full"));
    await expect(
      store.getState().reorderPlaylistSongs(["s2", "s1"]),
    ).rejects.toThrow("disk full");
    expect(store.getState().activeSongs).toEqual(mockSongs);
    expect(store.getState().isSavingOrder).toBe(false);
  });

  test("late reads and failed saves cannot overwrite another playlist", async () => {
    const { store, read, save } = setup();
    let finishRead!: (songs: typeof mockSongs) => void;
    read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRead = resolve;
        }),
    );
    const pending = store.getState().loadActiveSongs();
    store.getState().setActivePlaylist("pl-2");
    finishRead(mockSongs);
    await pending;
    expect(store.getState().activeSongs).toEqual([]);
    await store.getState().loadActiveSongs();
    let failSave!: (error: Error) => void;
    save.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          failSave = reject;
        }),
    );
    const saving = store.getState().reorderPlaylistSongs(["s2", "s1"]);
    store.getState().setActivePlaylist("pl-3");
    failSave(new Error("failed"));
    await expect(saving).rejects.toThrow();
    expect(store.getState().activeSongs).toEqual([]);
  });

  test("queue replacement reads saved order and replaces once, including the current song", async () => {
    const { store, read } = setup();
    await store.getState().loadActiveSongs();
    read.mockResolvedValueOnce([...mockSongs].reverse());
    const replace = vi.fn();
    expect(await store.getState().replacePlaylistQueue(replace)).toEqual({
      count: 2,
      skipped: 0,
    });
    expect(replace).toHaveBeenCalledExactlyOnceWith(["s2", "s1"]);
  });

  test("missing songs are skipped; all missing or failed reads preserve the queue", async () => {
    const { store, read, readLibrary } = setup();
    await store.getState().loadActiveSongs();
    readLibrary.mockResolvedValueOnce([{ ...PREVIEW_SONGS[0], hash: "s2" }]);
    const replace = vi.fn();
    expect(await store.getState().replacePlaylistQueue(replace)).toEqual({
      count: 1,
      skipped: 1,
    });
    expect(replace).toHaveBeenCalledExactlyOnceWith(["s2"]);
    replace.mockClear();
    readLibrary.mockResolvedValueOnce([]);
    expect(await store.getState().replacePlaylistQueue(replace)).toEqual({
      count: 0,
      skipped: 2,
    });
    read.mockRejectedValueOnce(new Error("unavailable"));
    await expect(
      store.getState().replacePlaylistQueue(replace),
    ).rejects.toThrow("unavailable");
    expect(replace).not.toHaveBeenCalled();
    expect(store.getState().isReplacingQueue).toBe(false);
  });

  test("switching playlist during replacement discards the pending result", async () => {
    const { store, read } = setup();
    await store.getState().loadActiveSongs();
    let finish!: (songs: typeof mockSongs) => void;
    read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const replace = vi.fn();
    const pending = store.getState().replacePlaylistQueue(replace);
    store.getState().setActivePlaylist("pl-2");
    finish(mockSongs);
    expect(await pending).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });
});
