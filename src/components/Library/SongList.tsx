import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { notifyError, notifySuccess } from "@/lib/errors";
import { useQueueStore } from "@/stores/queue-store";
import { songDisplayTitle } from "@/lib/song-display";
import { getDropIndicatorPosition } from "@/components/Player/queue-dnd";
import { SortablePlaylistSong } from "./SortablePlaylistSong";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { SongListItem } from "./SongListItem";
import { EmptyLibrary } from "./EmptyLibrary";
import { AlphabetRail } from "./AlphabetRail";
import { resolveSongListMeasureElement } from "./song-list-virtual";
import { useLibraryStore } from "@/stores/library-store";
import { usePlaylistStore } from "@/stores/playlist-store";
import { useSettingsStore } from "@/stores/settings-store";
import { sortSongs } from "@/lib/song-sort";
import { buildAlphabetIndex } from "@/lib/alphabet-index";

const PlaylistEditor = lazy(() =>
  import("./PlaylistEditor").then((module) => ({
    default: module.PlaylistEditor,
  })),
);

const SONG_ROW_ESTIMATE_PX = 68;
const SONG_ROW_GAP_PX = 4;

function useAtLeast600Px(): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(min-width: 600px)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(min-width: 600px)");
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    if (mql.addEventListener) {
      mql.addEventListener("change", handler);
      return () => mql.removeEventListener("change", handler);
    }
    // Older WebViews lack addEventListener on MediaQueryList.
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, []);

  return matches;
}

interface SongListProps {
  previewMode?: boolean;
}

export function SongList({ previewMode = false }: SongListProps = {}) {
  const songs = useLibraryStore((s) => s.songs);
  const filter = useLibraryStore((s) => s.filter);
  const separationStatuses = useLibraryStore((s) => s.separationStatuses);
  const clearRangeSelectionAnchor = useLibraryStore(
    (s) => s.clearRangeSelectionAnchor,
  );
  const activePlaylistId = usePlaylistStore((s) => s.activePlaylistId);
  const { t } = useTranslation();
  const activeSongs = usePlaylistStore((s) => s.activeSongs);
  const loadActiveSongs = usePlaylistStore((s) => s.loadActiveSongs);
  const reorderPlaylistSongs = usePlaylistStore((s) => s.reorderPlaylistSongs);
  const replacePlaylistQueue = usePlaylistStore((s) => s.replacePlaylistQueue);
  const songsLoading = usePlaylistStore((s) => s.songsLoading);
  const isSavingOrder = usePlaylistStore((s) => s.isSavingOrder);
  const isReplacingQueue = usePlaylistStore((s) => s.isReplacingQueue);
  const busy = songsLoading || isSavingOrder || isReplacingQueue;
  const [editingPlaylist, setEditingPlaylist] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const playlistSongSets = usePlaylistStore((s) => s.playlistSongSets);
  const librarySortMode = useSettingsStore((s) => s.librarySortMode);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activePlaylistId) void loadActiveSongs().catch(notifyError);
    setDraggedId(null);
    setOverId(null);
  }, [activePlaylistId, loadActiveSongs, playlistSongSets]);

  const playlistSongs = useMemo(() => {
    const byHash = new Map(songs.map((song) => [song.hash, song]));
    return (activeSongs ?? []).flatMap((entry) => {
      const song = byHash.get(entry.song_hash);
      return song ? [song] : [];
    });
  }, [activeSongs, songs]);

  const separatedSongs = useMemo(
    () =>
      filter === "separated"
        ? songs.filter(
            (song) => separationStatuses[song.hash]?.state === "completed",
          )
        : null,
    [filter, songs, separationStatuses],
  );

  const displaySongs = useMemo(() => {
    if (activePlaylistId) return playlistSongs;
    const base = filter === "separated" ? (separatedSongs ?? songs) : songs;
    return sortSongs(base, librarySortMode);
  }, [
    activePlaylistId,
    playlistSongs,
    filter,
    separatedSongs,
    songs,
    librarySortMode,
  ]);

  const orderedHashes = displaySongs.map((s) => s.hash);

  const virtualizer = useVirtualizer({
    count: displaySongs.length,
    getItemKey: (index) => displaySongs[index].hash,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => SONG_ROW_ESTIMATE_PX,
    gap: SONG_ROW_GAP_PX,
    overscan: 8,
    useAnimationFrameWithResizeObserver: !!activePlaylistId,
    measureElement: resolveSongListMeasureElement(
      typeof window !== "undefined",
      typeof navigator !== "undefined" ? navigator.userAgent : "",
    ),
  });

  const isAtLeast600Px = useAtLeast600Px();

  const railSortMode =
    librarySortMode === "title_asc" || librarySortMode === "artist_asc"
      ? librarySortMode
      : null;

  const indexByBucket = useMemo(() => {
    if (!railSortMode) return null;
    return buildAlphabetIndex(displaySongs, railSortMode);
  }, [displaySongs, railSortMode]);

  const showRail =
    activePlaylistId == null &&
    displaySongs.length > 0 &&
    railSortMode !== null &&
    isAtLeast600Px;

  const previousSortModeRef = useRef(librarySortMode);
  useEffect(() => {
    if (previousSortModeRef.current === librarySortMode) return;
    previousSortModeRef.current = librarySortMode;
    if (activePlaylistId) return;
    clearRangeSelectionAnchor();
    if (displaySongs.length > 0) {
      virtualizer.scrollToIndex(0, { align: "start" });
    }
  }, [
    librarySortMode,
    activePlaylistId,
    displaySongs.length,
    clearRangeSelectionAnchor,
    virtualizer,
  ]);

  const moveSong = (
    hash: string,
    targetHash: string,
    focusTarget: "handle" | "song" = "handle",
  ) => {
    if (busy || !activePlaylistId) return;
    const hashes = activeSongs.map((entry) => entry.song_hash);
    const from = hashes.indexOf(hash);
    const to = hashes.indexOf(targetHash);
    if (from < 0 || to < 0 || from === to) return;
    clearRangeSelectionAnchor();
    const playlistId = activePlaylistId;
    void reorderPlaylistSongs(arrayMove(hashes, from, to))
      .catch(() => notifyError(new Error(t("playlist.reorderFailed"))))
      .finally(() => {
        const state = usePlaylistStore.getState();
        if (state.activePlaylistId !== playlistId) return;
        const index = displaySongs.findIndex(
          (song) => song.hash === targetHash,
        );
        virtualizer.scrollToIndex(index, { align: "auto" });
        requestAnimationFrame(() => {
          const selector =
            focusTarget === "handle"
              ? `[data-playlist-drag-hash="${CSS.escape(hash)}"]`
              : `[data-song-hash="${CSS.escape(hash)}"] [data-song-action="select"]`;
          scrollRef.current?.querySelector<HTMLElement>(selector)?.focus();
        });
      });
  };
  const endDrag = ({ active, over }: DragEndEvent) => {
    if (over) moveSong(String(active.id), String(over.id));
    setDraggedId(null);
    setOverId(null);
  };
  const replaceQueue = async () => {
    try {
      const result = await replacePlaylistQueue((hashes) =>
        useQueueStore.getState().setQueue(hashes),
      );
      if (result)
        notifySuccess(
          t("playlist.queueReplaced", { count: result.count }),
          result.skipped
            ? t("playlist.queueSkipped", { count: result.skipped })
            : "",
        );
    } catch {
      notifyError(new Error(t("playlist.queueReplaceFailed")));
    }
  };

  if (displaySongs.length === 0 && !activePlaylistId) return <EmptyLibrary />;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {editingPlaylist && (
        <Suspense fallback={null}>
          <PlaylistEditor
            playlistId={editingPlaylist}
            onClose={() => setEditingPlaylist(null)}
          />
        </Suspense>
      )}
      {activePlaylistId && (
        <button
          className="mx-2 mb-2 rounded border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-40"
          disabled={busy}
          onClick={(event) => {
            event.currentTarget.focus();
            setEditingPlaylist(activePlaylistId);
          }}
        >
          {t("playlistEditor.title")}
        </button>
      )}
      {activePlaylistId && (
        <button
          className="mx-2 mb-2 rounded px-2 py-1 text-sm text-[var(--color-text)] hover:bg-[var(--color-hover)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-40"
          disabled={busy || (activeSongs?.length ?? 0) === 0}
          onClick={() => void replaceQueue()}
        >
          {t("playlist.replaceQueue")}
        </button>
      )}
      {activePlaylistId && displaySongs.length === 0 && (
        <p role="status" className="p-3 text-sm text-[var(--color-text-dim)]">
          {songsLoading ? t("common.loading") : t("playlist.empty")}
        </p>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => setDraggedId(String(active.id))}
        onDragOver={({ over }) => setOverId(over ? String(over.id) : null)}
        onDragEnd={endDrag}
        onDragCancel={() => {
          setDraggedId(null);
          setOverId(null);
        }}
        accessibility={{
          screenReaderInstructions: {
            draggable: t("playlist.dragInstructions"),
          },
          announcements: {
            onDragStart: () => t("playlist.dragStarted"),
            onDragOver: ({ over }) =>
              over
                ? t("playlist.dragPosition", {
                    position: orderedHashes.indexOf(String(over.id)) + 1,
                  })
                : undefined,
            onDragEnd: ({ over }) =>
              over
                ? t("playlist.dragPosition", {
                    position: orderedHashes.indexOf(String(over.id)) + 1,
                  })
                : t("playlist.dragCancelled"),
            onDragCancel: () => t("playlist.dragCancelled"),
          },
        }}
      >
        <SortableContext
          items={activePlaylistId ? orderedHashes : []}
          strategy={verticalListSortingStrategy}
        >
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto"
            data-testid="song-list"
            data-song-list-visual-variant="unified"
            data-preview-song-list="true"
            style={showRail ? { paddingRight: "24px" } : undefined}
          >
            <div
              className="relative w-full"
              style={{ height: `${virtualizer.getTotalSize()}px` }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const song = displaySongs[virtualRow.index];
                return (
                  <div
                    key={song.hash}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    className="absolute left-0 top-0 w-full"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    {activePlaylistId ? (
                      <SortablePlaylistSong
                        id={song.hash}
                        title={songDisplayTitle(song)}
                        disabled={!!busy}
                        dropIndicator={
                          overId === song.hash
                            ? getDropIndicatorPosition(
                                orderedHashes.indexOf(draggedId ?? ""),
                                orderedHashes.indexOf(overId ?? ""),
                              )
                            : null
                        }
                      >
                        <SongListItem
                          song={song}
                          orderedHashes={orderedHashes}
                          previewMode={previewMode}
                          reorderMenuItems={[
                            {
                              label: t("playlist.moveUp"),
                              disabled: !!busy || virtualRow.index === 0,
                              onClick: () =>
                                moveSong(
                                  song.hash,
                                  orderedHashes[virtualRow.index - 1],
                                  "song",
                                ),
                            },
                            {
                              label: t("playlist.moveDown"),
                              disabled:
                                !!busy ||
                                virtualRow.index === displaySongs.length - 1,
                              onClick: () =>
                                moveSong(
                                  song.hash,
                                  orderedHashes[virtualRow.index + 1],
                                  "song",
                                ),
                            },
                          ]}
                        />
                      </SortablePlaylistSong>
                    ) : (
                      <SongListItem
                        song={song}
                        orderedHashes={orderedHashes}
                        previewMode={previewMode}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </SortableContext>
        {typeof document !== "undefined" && draggedId
          ? createPortal(
              <DragOverlay dropAnimation={null}>
                {draggedId ? (
                  <div className="rounded bg-[var(--color-surface)] p-3 text-[var(--color-text)] shadow-lg">
                    {songDisplayTitle(
                      displaySongs.find((song) => song.hash === draggedId),
                    )}
                  </div>
                ) : null}
              </DragOverlay>,
              document.body,
            )
          : null}
      </DndContext>
      {showRail && indexByBucket && (
        <AlphabetRail
          indexByBucket={indexByBucket}
          onNavigate={(index) => {
            clearRangeSelectionAnchor();
            virtualizer.scrollToIndex(index, { align: "start" });
          }}
        />
      )}
    </div>
  );
}
