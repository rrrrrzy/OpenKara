// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vite-plus/test";
import { SongList } from "./SongList";
import { useQueueStore } from "@/stores/queue-store";
import { notifyError, notifySuccess } from "@/lib/errors";
import type { ContextMenuItem } from "./ContextMenu";
import type { Song } from "@/types/ipc";

type PlaylistEntry = {
  song_hash: string;
  added_at: number;
  sort_order: number;
  singer: string | null;
};

const {
  mockLibraryState,
  mockPlaylistState,
  mockSettingsState,
  mockClearRangeSelectionAnchor,
  mockReorderMenus,
} = vi.hoisted(() => {
  const clearRangeSelectionAnchor = vi.fn();
  return {
    mockLibraryState: {
      songs: [] as Song[],
      filter: "all" as "all" | "separated",
      separationStatuses: {} as Record<string, { state: string }>,
      clearRangeSelectionAnchor,
    },
    mockPlaylistState: {
      activePlaylistId: null as string | null,
      activeSongs: [] as PlaylistEntry[],
      songsLoading: false,
      isSavingOrder: false,
      isReplacingQueue: false,
      reorderPlaylistSongs: vi.fn(async (_hashes: string[]) => {}),
      replacePlaylistQueue: vi.fn(
        async (
          _replace: (hashes: string[]) => void,
        ): Promise<{ count: number; skipped: number } | null> => null,
      ),
      loadActiveSongs: vi.fn(async () => {}),
      getPlaylistSongs: vi.fn(() => Promise.resolve<PlaylistEntry[]>([])),
      playlistSongSets: {} as Record<string, Set<string>>,
    },
    mockSettingsState: {
      librarySortMode: "recently_imported" as string,
    },
    mockClearRangeSelectionAnchor: clearRangeSelectionAnchor,
    mockReorderMenus: vi.fn(),
  };
});

vi.mock("@/lib/errors", () => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}));

vi.mock("@/stores/library-store", () => ({
  useLibraryStore: (selector: (state: typeof mockLibraryState) => unknown) =>
    selector(mockLibraryState),
}));

vi.mock("@/stores/playlist-store", () => ({
  usePlaylistStore: Object.assign(
    (selector: (state: typeof mockPlaylistState) => unknown) =>
      selector(mockPlaylistState),
    { getState: () => mockPlaylistState },
  ),
}));

vi.mock("@/stores/settings-store", () => ({
  useSettingsStore: (selector: (state: typeof mockSettingsState) => unknown) =>
    selector(mockSettingsState),
}));

vi.mock("./SongListItem", () => ({
  SongListItem: ({
    song,
    reorderMenuItems,
  }: {
    song: Song;
    reorderMenuItems?: ContextMenuItem[];
  }) => {
    mockReorderMenus(song.hash, reorderMenuItems);
    return <div data-testid="song-item">{song.title}</div>;
  },
}));

vi.mock("./EmptyLibrary", () => ({
  EmptyLibrary: () => <div data-testid="empty-library">empty</div>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { letter?: string }) =>
      key === "sidebar.alphabetRail.jumpTo"
        ? `Jump to ${opts?.letter ?? ""}`
        : key === "sidebar.alphabetRail.other"
          ? "Other characters"
          : key,
  }),
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 72,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        start: i * 72,
        size: 68,
        end: i * 72 + 68,
      })),
    scrollToIndex: vi.fn(),
  }),
}));

describe("SongList", () => {
  test("renders the empty library state when there are no songs", () => {
    mockLibraryState.songs = [];
    mockLibraryState.filter = "all";

    const markup = renderToStaticMarkup(<SongList />);

    expect(markup).toContain('data-testid="empty-library"');
    expect(markup).not.toContain('data-testid="song-item"');
  });

  test("renders song items for each song in the library", () => {
    mockLibraryState.songs = [
      {
        hash: "song-1",
        file_path: "/music/a.mp3",
        audio_source_kind: "original",
        cdg_path: null,
        media_g_container: null,
        instrumental: false,
        language: null,
        title: "Song A",
        artist: "Artist A",
        album: null,
        duration_ms: 120000,
        cover_art: null,
        has_cover_art: false,
        artwork_thumb_path: null,
        imported_at: 0,
        original_ext: "mp3",
      },
      {
        hash: "song-2",
        file_path: "/music/b.mp3",
        audio_source_kind: "original",
        cdg_path: null,
        media_g_container: null,
        instrumental: false,
        language: null,
        title: "Song B",
        artist: "Artist B",
        album: null,
        duration_ms: 180000,
        cover_art: null,
        has_cover_art: false,
        artwork_thumb_path: null,
        imported_at: 0,
        original_ext: "mp3",
      },
    ];
    mockLibraryState.filter = "all";

    const markup = renderToStaticMarkup(<SongList />);

    expect(markup).toContain("Song A");
    expect(markup).toContain("Song B");
    expect(markup).not.toContain('data-testid="empty-library"');
  });

  test("filters to separated songs when the filter is set to separated", () => {
    mockLibraryState.songs = [
      {
        hash: "song-sep",
        file_path: "/music/sep.mp3",
        audio_source_kind: "original",
        cdg_path: null,
        media_g_container: null,
        instrumental: false,
        language: null,
        title: "Separated",
        artist: "Artist",
        album: null,
        duration_ms: 120000,
        cover_art: null,
        has_cover_art: false,
        artwork_thumb_path: null,
        imported_at: 0,
        original_ext: "mp3",
      },
      {
        hash: "song-unsep",
        file_path: "/music/unsep.mp3",
        audio_source_kind: "original",
        cdg_path: null,
        media_g_container: null,
        instrumental: false,
        language: null,
        title: "Unseparated",
        artist: "Artist",
        album: null,
        duration_ms: 120000,
        cover_art: null,
        has_cover_art: false,
        artwork_thumb_path: null,
        imported_at: 0,
        original_ext: "mp3",
      },
    ];
    mockLibraryState.filter = "separated";
    mockLibraryState.separationStatuses = {
      "song-sep": { state: "completed" },
    };

    const markup = renderToStaticMarkup(<SongList />);

    expect(markup).toContain("Separated");
    expect(markup).not.toContain("Unseparated");

    mockLibraryState.filter = "all";
    mockLibraryState.separationStatuses = {};
  });

  test("shows the empty library when filter results in no songs", () => {
    mockLibraryState.songs = [
      {
        hash: "song-1",
        file_path: "/music/a.mp3",
        audio_source_kind: "original",
        cdg_path: null,
        media_g_container: null,
        instrumental: false,
        language: null,
        title: "Not Separated",
        artist: "Artist",
        album: null,
        duration_ms: 120000,
        cover_art: null,
        has_cover_art: false,
        artwork_thumb_path: null,
        imported_at: 0,
        original_ext: "mp3",
      },
    ];
    mockLibraryState.filter = "separated";
    mockLibraryState.separationStatuses = {};

    const markup = renderToStaticMarkup(<SongList />);

    expect(markup).toContain('data-testid="empty-library"');

    mockLibraryState.filter = "all";
  });

  test("sets the unified visual variant data attribute on the scroll container", () => {
    mockLibraryState.songs = [
      {
        hash: "song-1",
        file_path: "/music/a.mp3",
        audio_source_kind: "original",
        cdg_path: null,
        media_g_container: null,
        instrumental: false,
        language: null,
        title: "Song",
        artist: "Artist",
        album: null,
        duration_ms: 120000,
        cover_art: null,
        has_cover_art: false,
        artwork_thumb_path: null,
        imported_at: 0,
        original_ext: "mp3",
      },
    ];
    mockLibraryState.filter = "all";

    const markup = renderToStaticMarkup(<SongList />);

    expect(markup).toContain('data-song-list-visual-variant="unified"');

    mockLibraryState.songs = [];
  });
});

describe("SongList sort mode effect", () => {
  afterEach(() => {
    cleanup();
    mockClearRangeSelectionAnchor.mockReset();
    mockSettingsState.librarySortMode = "recently_imported";
    mockLibraryState.songs = [];
    mockLibraryState.filter = "all";
    mockPlaylistState.activePlaylistId = null;
  });

  test("clears range selection anchor when sort mode changes", () => {
    const song: Song = {
      hash: "song-1",
      file_path: "/music/a.mp3",
      audio_source_kind: "original",
      cdg_path: null,
      media_g_container: null,
      instrumental: false,
      language: null,
      title: "Song",
      artist: "Artist",
      album: null,
      duration_ms: 120000,
      cover_art: null,
      has_cover_art: false,
      artwork_thumb_path: null,
      imported_at: 0,
      original_ext: "mp3",
    };
    mockLibraryState.songs = [song];
    mockPlaylistState.activeSongs = [
      { song_hash: "song-1", added_at: 0, sort_order: 0, singer: null },
    ];
    mockSettingsState.librarySortMode = "recently_imported";

    const { rerender } = render(<SongList />);
    expect(mockClearRangeSelectionAnchor).not.toHaveBeenCalled();

    mockSettingsState.librarySortMode = "title_asc";
    rerender(<SongList />);

    expect(mockClearRangeSelectionAnchor).toHaveBeenCalledTimes(1);
  });

  test("does not clear anchor when sort mode stays the same on rerender", () => {
    const song: Song = {
      hash: "song-1",
      file_path: "/music/a.mp3",
      audio_source_kind: "original",
      cdg_path: null,
      media_g_container: null,
      instrumental: false,
      language: null,
      title: "Song",
      artist: "Artist",
      album: null,
      duration_ms: 120000,
      cover_art: null,
      has_cover_art: false,
      artwork_thumb_path: null,
      imported_at: 0,
      original_ext: "mp3",
    };
    mockLibraryState.songs = [song];
    mockSettingsState.librarySortMode = "title_asc";

    const { rerender } = render(<SongList />);
    rerender(<SongList />);

    expect(mockClearRangeSelectionAnchor).not.toHaveBeenCalled();
  });

  test("does not clear anchor when a playlist is active", () => {
    const song: Song = {
      hash: "song-1",
      file_path: "/music/a.mp3",
      audio_source_kind: "original",
      cdg_path: null,
      media_g_container: null,
      instrumental: false,
      language: null,
      title: "Song",
      artist: "Artist",
      album: null,
      duration_ms: 120000,
      cover_art: null,
      has_cover_art: false,
      artwork_thumb_path: null,
      imported_at: 0,
      original_ext: "mp3",
    };
    mockLibraryState.songs = [song];
    mockPlaylistState.activePlaylistId = "pl-1";
    mockPlaylistState.getPlaylistSongs = vi.fn(() =>
      Promise.resolve([
        { song_hash: "song-1", added_at: 0, sort_order: 0, singer: null },
      ]),
    );
    mockPlaylistState.activeSongs = [
      { song_hash: "song-1", added_at: 0, sort_order: 0, singer: null },
    ];
    mockSettingsState.librarySortMode = "recently_imported";

    const { rerender } = render(<SongList />);

    mockSettingsState.librarySortMode = "title_asc";
    rerender(<SongList />);

    expect(mockClearRangeSelectionAnchor).not.toHaveBeenCalled();
    mockPlaylistState.activePlaylistId = null;
  });
});

describe("SongList playlist materialization", () => {
  afterEach(() => {
    cleanup();
    mockPlaylistState.activePlaylistId = null;
    mockPlaylistState.getPlaylistSongs = vi.fn(() => Promise.resolve([]));
    mockLibraryState.songs = [];
  });

  test("preserves backend sort_order instead of library order", async () => {
    const songA: Song = {
      hash: "aaa",
      file_path: "/music/a.mp3",
      audio_source_kind: "original",
      cdg_path: null,
      media_g_container: null,
      instrumental: false,
      language: null,
      title: "Alpha",
      artist: "Artist A",
      album: null,
      duration_ms: 120000,
      cover_art: null,
      has_cover_art: false,
      artwork_thumb_path: null,
      imported_at: 100,
      original_ext: "mp3",
    };
    const songB: Song = {
      hash: "bbb",
      file_path: "/music/b.mp3",
      audio_source_kind: "original",
      cdg_path: null,
      media_g_container: null,
      instrumental: false,
      language: null,
      title: "Beta",
      artist: "Artist B",
      album: null,
      duration_ms: 120000,
      cover_art: null,
      has_cover_art: false,
      artwork_thumb_path: null,
      imported_at: 200,
      original_ext: "mp3",
    };
    // Library order is [songA, songB], but playlist sort_order reverses it.
    mockLibraryState.songs = [songA, songB];
    mockPlaylistState.activePlaylistId = "pl-1";
    mockPlaylistState.getPlaylistSongs = vi.fn(() =>
      Promise.resolve([
        { song_hash: "bbb", added_at: 0, sort_order: 0, singer: null },
        { song_hash: "aaa", added_at: 0, sort_order: 1, singer: null },
      ]),
    );

    mockPlaylistState.activeSongs = [
      { song_hash: "bbb", added_at: 0, sort_order: 0, singer: null },
      { song_hash: "aaa", added_at: 0, sort_order: 1, singer: null },
    ];
    render(<SongList />);

    const items = await screen.findAllByTestId("song-item");
    expect(items[0].textContent).toBe("Beta");
    expect(items[1].textContent).toBe("Alpha");
    expect(mockReorderMenus).toHaveBeenCalledWith("bbb", [
      expect.objectContaining({ label: "playlist.moveUp", disabled: true }),
      expect.objectContaining({ label: "playlist.moveDown", disabled: false }),
    ]);
    expect(mockReorderMenus).toHaveBeenCalledWith("aaa", [
      expect.objectContaining({ label: "playlist.moveUp", disabled: false }),
      expect.objectContaining({ label: "playlist.moveDown", disabled: true }),
    ]);
  });
});

function makeSong(overrides: Partial<Song> = {}): Song {
  return {
    hash: "hash",
    file_path: "/music/a.mp3",
    audio_source_kind: "original",
    cdg_path: null,
    media_g_container: null,
    instrumental: false,
    language: null,
    title: "Title",
    artist: "Artist",
    album: null,
    duration_ms: 120000,
    cover_art: null,
    has_cover_art: false,
    artwork_thumb_path: null,
    imported_at: 0,
    original_ext: "mp3",
    ...overrides,
  };
}

function installMatchMedia(matches: boolean, legacy: boolean) {
  const listeners: ((e: MediaQueryListEvent) => void)[] = [];
  const mql = {
    matches,
    media: "(min-width: 600px)",
    onchange: null as ((e: MediaQueryListEvent) => void) | null,
    addEventListener: legacy
      ? undefined
      : (type: string, handler: (e: MediaQueryListEvent) => void) => {
          if (type === "change") listeners.push(handler);
        },
    removeEventListener: legacy
      ? undefined
      : (_type: string, handler: (e: MediaQueryListEvent) => void) => {
          const i = listeners.indexOf(handler);
          if (i >= 0) listeners.splice(i, 1);
        },
    addListener: (handler: (e: MediaQueryListEvent) => void) =>
      listeners.push(handler),
    removeListener: (handler: (e: MediaQueryListEvent) => void) => {
      const i = listeners.indexOf(handler);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
  vi.stubGlobal("matchMedia", () => mql);
  return mql;
}

describe("SongList alphabet rail visibility", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    mockClearRangeSelectionAnchor.mockReset();
    mockSettingsState.librarySortMode = "recently_imported";
    mockLibraryState.songs = [];
    mockLibraryState.filter = "all";
    mockPlaylistState.activePlaylistId = null;
  });

  test("shows the alphabet rail when viewport >=600px (modern matchMedia)", () => {
    installMatchMedia(true, false);
    mockLibraryState.songs = [
      makeSong({ hash: "a", title: "Apple", artist: "Artist A" }),
      makeSong({ hash: "b", title: "Banana", artist: "Artist B" }),
    ];
    mockSettingsState.librarySortMode = "title_asc";

    render(<SongList />);

    expect(screen.getByRole("navigation")).toBeTruthy();
  });

  test("shows the alphabet rail via legacy addListener fallback", () => {
    installMatchMedia(true, true);
    mockLibraryState.songs = [
      makeSong({ hash: "a", title: "Apple", artist: "Artist A" }),
    ];
    mockSettingsState.librarySortMode = "artist_asc";

    render(<SongList />);

    expect(screen.getByRole("navigation")).toBeTruthy();
  });

  test("hides the alphabet rail when viewport <600px", () => {
    installMatchMedia(false, false);
    mockLibraryState.songs = [
      makeSong({ hash: "a", title: "Apple", artist: "Artist A" }),
    ];
    mockSettingsState.librarySortMode = "title_asc";

    render(<SongList />);

    expect(screen.queryByRole("navigation")).toBeNull();
  });

  test("rail navigation clears the range-selection anchor and scrolls", () => {
    installMatchMedia(true, false);
    mockLibraryState.songs = [
      makeSong({ hash: "a", title: "Apple", artist: "Artist A" }),
      makeSong({ hash: "b", title: "Banana", artist: "Artist B" }),
    ];
    mockSettingsState.librarySortMode = "title_asc";

    render(<SongList />);

    const buttons = screen.getAllByRole("button");
    const buttonB = buttons[1];
    fireEvent.click(buttonB);

    expect(mockClearRangeSelectionAnchor).toHaveBeenCalled();
  });
});

describe("playlist actions", () => {
  beforeEach(() => {
    mockLibraryState.songs = [
      makeSong({ hash: "a", title: "Alpha" }),
      makeSong({ hash: "b", title: "Beta" }),
    ];
    mockLibraryState.filter = "all";
    mockPlaylistState.activePlaylistId = "actions";
    mockPlaylistState.activeSongs = [
      { song_hash: "a", added_at: 0, sort_order: 0, singer: null },
      { song_hash: "b", added_at: 0, sort_order: 1, singer: null },
    ];
    mockPlaylistState.isSavingOrder = false;
    mockPlaylistState.isReplacingQueue = false;
    mockPlaylistState.songsLoading = false;
    mockPlaylistState.reorderPlaylistSongs
      .mockReset()
      .mockResolvedValue(undefined);
    mockPlaylistState.replacePlaylistQueue.mockReset().mockResolvedValue(null);
    mockReorderMenus.mockClear();
    vi.mocked(notifyError).mockClear();
    vi.mocked(notifySuccess).mockClear();
    useQueueStore.setState({ queue: ["old"], playHistory: ["history"] });
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    cleanup();
    mockPlaylistState.activePlaylistId = null;
    mockPlaylistState.isSavingOrder = false;
    mockLibraryState.songs = [];
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function menuFor(hash: string): ContextMenuItem[] {
    const call = mockReorderMenus.mock.calls.find(
      ([songHash]) => songHash === hash,
    );
    expect(call).toBeDefined();
    return call![1];
  }

  test("moving songs submits the full order and clears the range anchor", async () => {
    render(<SongList />);
    await act(async () => menuFor("a")[1].onClick?.());
    expect(mockPlaylistState.reorderPlaylistSongs).toHaveBeenCalledWith([
      "b",
      "a",
    ]);
    expect(mockClearRangeSelectionAnchor).toHaveBeenCalled();
    expect(notifyError).not.toHaveBeenCalled();
    await act(async () => menuFor("b")[0].onClick?.());
    expect(mockPlaylistState.reorderPlaylistSongs).toHaveBeenCalledTimes(2);
  });

  test("save failure reports recovery and a boundary move does not submit", async () => {
    mockPlaylistState.reorderPlaylistSongs.mockRejectedValueOnce(
      new Error("disk full"),
    );
    render(<SongList />);
    await act(async () => menuFor("a")[0].onClick?.());
    expect(mockPlaylistState.reorderPlaylistSongs).not.toHaveBeenCalled();
    await act(async () => menuFor("a")[1].onClick?.());
    expect(notifyError).toHaveBeenCalledWith(
      new Error("playlist.reorderFailed"),
    );
  });

  test("queue replacement publishes the loaded order and preserves history", async () => {
    mockPlaylistState.replacePlaylistQueue.mockImplementationOnce(
      async (replace) => {
        replace(["b", "a"]);
        return { count: 2, skipped: 1 };
      },
    );
    render(<SongList />);
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "playlist.replaceQueue" }),
      ),
    );
    expect(useQueueStore.getState().queue).toEqual(["b", "a"]);
    expect(useQueueStore.getState().playHistory).toEqual(["history"]);
    expect(notifySuccess).toHaveBeenCalledWith(
      "playlist.queueReplaced",
      "playlist.queueSkipped",
    );
  });

  test("failed reads preserve the queue and report an error", async () => {
    mockPlaylistState.replacePlaylistQueue.mockRejectedValueOnce(
      new Error("unavailable"),
    );
    render(<SongList />);
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "playlist.replaceQueue" }),
      ),
    );
    expect(useQueueStore.getState().queue).toEqual(["old"]);
    expect(notifyError).toHaveBeenCalledWith(
      new Error("playlist.queueReplaceFailed"),
    );
  });

  test("save and empty states disable queue replacement", () => {
    mockPlaylistState.isSavingOrder = true;
    const { rerender } = render(<SongList />);
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "playlist.replaceQueue",
      }).disabled,
    ).toBe(true);
    mockPlaylistState.isSavingOrder = false;
    mockPlaylistState.activeSongs = [];
    rerender(<SongList />);
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "playlist.replaceQueue",
      }).disabled,
    ).toBe(true);
  });
});
