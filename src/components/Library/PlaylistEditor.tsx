import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useBackend, type PlaylistSong } from "@/lib/backend";
import { useModalDialog } from "@/hooks/use-modal-dialog";
import { DialogBackdrop } from "@/components/Overlay/DialogBackdrop";
import { usePlaylistStore } from "@/stores/playlist-store";
import { usePlayerStore } from "@/stores/player-store";
import {
  newPlaylistEntry,
  parsePlaylistText,
  resolvePlaylistText,
  serializePlaylistText,
  type PlaylistTextRow,
} from "@/lib/playlist-editor";
import { songDisplayTitle } from "@/lib/song-display";
import type { Song } from "@/types/ipc";

const control =
  "min-h-8 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-40";

function SortableRow({
  id,
  label,
  disabled,
  children,
}: {
  id: string;
  label: string;
  disabled: boolean;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
  } = useSortable({ id, disabled });
  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="border-b border-[var(--color-border)]"
    >
      <td className="p-2">
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={label}
          disabled={disabled}
          className={`${control} touch-none`}
        >
          ⠿
        </button>
      </td>
      {children}
    </tr>
  );
}

export function PlaylistEditor({
  playlistId,
  onClose,
}: {
  playlistId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const api = useBackend();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [expected, setExpected] = useState<PlaylistSong[]>([]);
  const [entries, setEntries] = useState<PlaylistSong[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const currentSnapshot = usePlayerStore((state) => state.snapshot);
  const [query, setQuery] = useState("");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<PlaylistTextRow[] | null>(null);
  const [showText, setShowText] = useState(false);
  const [textEdited, setTextEdited] = useState(false);
  const [busy, setBusy] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [local, setLocal] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [unavailable, setUnavailable] = useState<string[] | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const dismiss = () => {
    if (
      !busy &&
      (!(dirty || textEdited) || window.confirm(t("playlistEditor.discard")))
    )
      onClose();
  };
  useModalDialog({
    dialogRef,
    onDismiss: dismiss,
    canDismiss: !busy && dragged === null,
  });

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      api.playlist.getPlaylistSongs(playlistId),
      api.library.getLibrary(),
      api.librarySetup.getActiveLibrary(),
    ])
      .then(([saved, library, active]) => {
        if (cancelled) return;
        setExpected(saved);
        setEntries(
          saved.map((entry) => ({
            ...entry,
            vocal_volume: entry.vocal_volume ?? 1,
            accompaniment_volume: entry.accompaniment_volume ?? 1,
          })),
        );
        setSongs(library);
        setLocal(active?.kind === "local");
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setError(t("playlistEditor.loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, playlistId, t]);

  const change = (next: PlaylistSong[]) => {
    setEntries(next);
    setSelected(
      (before) =>
        new Set(
          [...before].filter((hash) =>
            next.some((entry) => entry.song_hash === hash),
          ),
        ),
    );
    setDirty(true);
    setUnavailable(null);
    setMessage("");
  };
  const move = (from: number, to: number) => {
    if (to >= 0 && to < entries.length && from !== to)
      change(arrayMove(entries, from, to));
  };
  const batch = (vocal: number) =>
    change(
      entries.map((entry) =>
        selected.has(entry.song_hash)
          ? { ...entry, vocal_volume: vocal, accompaniment_volume: 1 }
          : entry,
      ),
    );
  const updateVolume = (
    hash: string,
    field: "vocal_volume" | "accompaniment_volume",
    value: string,
  ) => {
    if (!/^\d{1,3}$/.test(value) || Number(value) > 100) return;
    change(
      entries.map((entry) =>
        entry.song_hash === hash
          ? { ...entry, [field]: Number(value) / 100 }
          : entry,
      ),
    );
  };
  const save = async () => {
    setBusy(true);
    setError("");
    const next = entries.map((entry, sort_order) => ({ ...entry, sort_order }));
    try {
      await api.playlist.savePlaylistSongs(playlistId, expected, next);
      setExpected(next);
      setEntries(next);
      setDirty(false);
      setMessage(t("playlistEditor.saved"));
      await usePlaylistStore.getState().loadPlaylists();
      await usePlaylistStore.getState().loadActiveSongs();
    } catch {
      setError(t("playlistEditor.saveFailed"));
    } finally {
      setBusy(false);
    }
  };
  const check = async () => {
    setBusy(true);
    setError("");
    try {
      const missing = await api.playlist.checkPlaylistReady(
        entries.map((entry) => entry.song_hash),
      );
      setUnavailable(missing);
      setMessage(
        t(missing.length ? "playlistEditor.notReady" : "playlistEditor.ready"),
      );
    } catch {
      setError(t("playlistEditor.checkFailed"));
    } finally {
      setBusy(false);
    }
  };
  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const missing = await api.playlist.checkPlaylistReady(
        entries.map((entry) => entry.song_hash),
      );
      setUnavailable(missing);
      if (missing.length) {
        setMessage(t("playlistEditor.notReady"));
        return;
      }
      if (!window.confirm(t("playlistEditor.startConfirm"))) return;
      await usePlayerStore.getState().startPlaylist(expected);
      onClose();
    } catch {
      setError(t("playlistEditor.startFailed"));
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        serializePlaylistText(entries, songs),
      );
      setMessage(t("playlistEditor.copied"));
    } catch {
      setText(serializePlaylistText(entries, songs));
      setShowText(true);
      setMessage(t("playlistEditor.copyManually"));
    }
  };
  const duplicate = preview?.some(
    (row, index) =>
      row.songHash &&
      preview.slice(0, index).some((other) => other.songHash === row.songHash),
  );
  const canApply =
    !!preview?.length &&
    !duplicate &&
    preview.every((row) => !row.error && row.songHash);
  const present = new Set(entries.map((entry) => entry.song_hash));
  const matches = songs
    .filter(
      (song) =>
        !present.has(song.hash) &&
        `${songDisplayTitle(song)} ${song.artist ?? ""}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
    )
    .slice(0, 30);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <DialogBackdrop
        ariaLabel={t("common.close")}
        onDismiss={dismiss}
        className="absolute inset-0 bg-black/60"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="playlist-editor-title"
        aria-describedby="playlist-editor-description"
        aria-busy={busy}
        tabIndex={-1}
        className="relative flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-sidebar)] text-[var(--color-text)] shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] p-5">
          <div>
            <h2 id="playlist-editor-title" className="text-lg font-semibold">
              {t("playlistEditor.title")}
            </h2>
            <p
              id="playlist-editor-description"
              className="mt-1 text-sm text-[var(--color-text-dim)]"
            >
              {t("playlistEditor.description")}
            </p>
          </div>
          <button className={control} onClick={dismiss} disabled={busy}>
            {t("common.close")}
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-5">
          <p role="status" className="text-sm">
            {busy ? t("playlistEditor.working") : message}
          </p>
          {error && (
            <p role="alert" className="text-sm text-[var(--color-destructive)]">
              {error}
            </p>
          )}
          {!local && loaded && (
            <p role="alert">{t("playlistEditor.localOnly")}</p>
          )}
          <fieldset
            disabled={busy || !loaded || !local}
            className="min-w-0 space-y-4"
          >
            <legend className="sr-only">{t("playlistEditor.title")}</legend>
            <div className="flex flex-wrap gap-2">
              <button
                className={control}
                onClick={() => setShowText(!showText)}
              >
                {t("playlistEditor.textMode")}
              </button>
              <button className={control} onClick={() => void copy()}>
                {t("playlistEditor.copy")}
              </button>
              {(["vocal_volume", "accompaniment_volume"] as const).map(
                (field) => (
                  <label
                    key={field}
                    className="flex items-center gap-2 text-sm"
                  >
                    {t(
                      field === "vocal_volume"
                        ? "playlistEditor.batchVocal"
                        : "playlistEditor.batchAccompaniment",
                    )}
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      defaultValue={100}
                      disabled={!selected.size}
                      className={`${control} w-20`}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (/^\d{1,3}$/.test(value) && Number(value) <= 100)
                          change(
                            entries.map((entry) =>
                              selected.has(entry.song_hash)
                                ? { ...entry, [field]: Number(value) / 100 }
                                : entry,
                            ),
                          );
                      }}
                    />
                  </label>
                ),
              )}
              <button
                className={control}
                onClick={() => batch(0)}
                disabled={!selected.size}
              >
                {t("playlistEditor.instrumental")}
              </button>
              <button
                className={control}
                onClick={() => batch(1)}
                disabled={!selected.size}
              >
                {t("playlistEditor.original")}
              </button>
              <button
                className={control}
                onClick={() =>
                  change(
                    entries.filter((entry) => !selected.has(entry.song_hash)),
                  )
                }
                disabled={!selected.size}
              >
                {t("playlistEditor.removeSelected")}
              </button>
            </div>
            {showText && (
              <section className="space-y-2 rounded-lg border border-[var(--color-border)] p-3">
                <label htmlFor="playlist-text" className="block text-sm">
                  {t("playlistEditor.textHelp")}
                </label>
                <textarea
                  id="playlist-text"
                  value={text}
                  onChange={(event) => {
                    setText(event.target.value);
                    setTextEdited(true);
                    setPreview(null);
                  }}
                  rows={6}
                  spellCheck={false}
                  className={`${control} w-full font-mono`}
                />
                <button
                  className={control}
                  onClick={() => setPreview(parsePlaylistText(text, songs))}
                >
                  {t("playlistEditor.preview")}
                </button>
                <button
                  className={control}
                  onClick={() => {
                    setText("");
                    setPreview(null);
                    setTextEdited(false);
                  }}
                >
                  {t("playlistEditor.discardText")}
                </button>
                {preview && (
                  <>
                    <ol className="space-y-2">
                      {preview.map((row, index) => (
                        <li
                          key={row.line}
                          className="flex flex-wrap items-center gap-2 text-sm"
                        >
                          <span>
                            {row.line}. {row.title} — {row.artist}
                          </span>
                          {row.error ? (
                            <span role="alert">
                              {t(`playlistEditor.${row.error}`)}
                            </span>
                          ) : (
                            <select
                              aria-label={t("playlistEditor.match", {
                                line: row.line,
                              })}
                              className={control}
                              value={row.songHash}
                              onChange={(event) =>
                                setPreview(
                                  preview.map((other, i) =>
                                    i === index
                                      ? {
                                          ...other,
                                          songHash: event.target.value,
                                        }
                                      : other,
                                  ),
                                )
                              }
                            >
                              <option value="">
                                {t(
                                  row.candidates.length
                                    ? "playlistEditor.chooseVersion"
                                    : "playlistEditor.chooseSong",
                                )}
                              </option>
                              {(row.candidates.length
                                ? row.candidates
                                : songs
                              ).map((song) => (
                                <option key={song.hash} value={song.hash}>
                                  {songDisplayTitle(song)} — {song.artist} —{" "}
                                  {song.album ?? ""} ({song.original_ext ?? ""},{" "}
                                  {song.duration_ms / 1000}s)
                                </option>
                              ))}
                            </select>
                          )}
                        </li>
                      ))}
                    </ol>
                    {duplicate && (
                      <p role="alert">{t("playlistEditor.duplicate")}</p>
                    )}
                    <button
                      className={control}
                      disabled={!canApply}
                      onClick={() => {
                        change(resolvePlaylistText(preview, entries));
                        setSelected(new Set());
                        setPreview(null);
                        setTextEdited(false);
                        setShowText(false);
                      }}
                    >
                      {t("playlistEditor.apply")}
                    </button>
                  </>
                )}
              </section>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="playlist-search" className="text-sm">
                {t("playlistEditor.addSongs")}
              </label>
              <input
                id="playlist-search"
                className={control}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("playlistEditor.search")}
              />
              <select
                aria-label={t("playlistEditor.addSongs")}
                className={`${control} max-w-full`}
                value=""
                onChange={(event) => {
                  if (event.target.value)
                    change([...entries, newPlaylistEntry(event.target.value)]);
                }}
              >
                <option value="">{t("playlistEditor.chooseSong")}</option>
                {matches.map((song) => (
                  <option key={song.hash} value={song.hash}>
                    {songDisplayTitle(song)} — {song.artist}
                  </option>
                ))}
              </select>
            </div>
            <DndContext
              sensors={sensors}
              accessibility={{
                screenReaderInstructions: {
                  draggable: t("playlist.dragInstructions"),
                },
                announcements: {
                  onDragStart: () => t("playlist.dragStarted"),
                  onDragOver: ({ over }) =>
                    over
                      ? t("playlist.dragPosition", {
                          position:
                            entries.findIndex(
                              (entry) => entry.song_hash === over.id,
                            ) + 1,
                        })
                      : undefined,
                  onDragEnd: ({ over }) =>
                    over
                      ? t("playlist.dragPosition", {
                          position:
                            entries.findIndex(
                              (entry) => entry.song_hash === over.id,
                            ) + 1,
                        })
                      : t("playlist.dragCancelled"),
                  onDragCancel: () => t("playlist.dragCancelled"),
                },
              }}
              onDragStart={({ active }) => setDragged(String(active.id))}
              onDragCancel={() => setDragged(null)}
              onDragEnd={({ active, over }) => {
                if (over)
                  move(
                    entries.findIndex((e) => e.song_hash === active.id),
                    entries.findIndex((e) => e.song_hash === over.id),
                  );
                setDragged(null);
              }}
            >
              <SortableContext
                items={entries.map((entry) => entry.song_hash)}
                strategy={verticalListSortingStrategy}
              >
                <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">
                      {t("playlistEditor.title")}
                    </caption>
                    <thead className="bg-[var(--color-surface)] text-[var(--color-text-dim)]">
                      <tr>
                        {(
                          [
                            "order",
                            "select",
                            "position",
                            "song",
                            "vocal",
                            "accompaniment",
                            "status",
                            "actions",
                          ] as const
                        ).map((column) => (
                          <th
                            key={column}
                            scope="col"
                            className="p-2 font-medium"
                          >
                            {column === "select" ? (
                              <input
                                type="checkbox"
                                aria-label={t("playlistEditor.selectAll")}
                                checked={
                                  entries.length > 0 &&
                                  entries.every((entry) =>
                                    selected.has(entry.song_hash),
                                  )
                                }
                                onChange={(event) =>
                                  setSelected(
                                    event.target.checked
                                      ? new Set(
                                          entries.map(
                                            (entry) => entry.song_hash,
                                          ),
                                        )
                                      : new Set(),
                                  )
                                }
                              />
                            ) : (
                              t(`playlistEditor.${column}`)
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry, index) => {
                        const song = songs.find(
                          (item) => item.hash === entry.song_hash,
                        );
                        const title =
                          songDisplayTitle(song) ||
                          t("playlistEditor.missingSong");
                        return (
                          <SortableRow
                            key={entry.song_hash}
                            id={entry.song_hash}
                            label={t("playlist.reorder", { title })}
                            disabled={busy}
                          >
                            <td className="p-2">
                              <input
                                type="checkbox"
                                aria-label={t("playlistEditor.selectSong", {
                                  title,
                                })}
                                checked={selected.has(entry.song_hash)}
                                onChange={(event) => {
                                  const next = new Set(selected);
                                  if (event.target.checked)
                                    next.add(entry.song_hash);
                                  else next.delete(entry.song_hash);
                                  setSelected(next);
                                }}
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                aria-label={t("playlistEditor.positionOf", {
                                  title,
                                })}
                                min={1}
                                max={entries.length}
                                defaultValue={index + 1}
                                key={`${entry.song_hash}-${index}`}
                                className={`${control} w-16 tabular-nums`}
                                onBlur={(event) => {
                                  const position = Number(event.target.value);
                                  if (Number.isInteger(position))
                                    move(index, position - 1);
                                  event.target.value = String(index + 1);
                                }}
                              />
                            </td>
                            <td className="min-w-40 p-2">
                              <div className="font-medium">{title}</div>
                              <div className="text-xs text-[var(--color-text-dim)]">
                                {song?.artist}
                              </div>
                            </td>
                            {(
                              ["vocal_volume", "accompaniment_volume"] as const
                            ).map((field) => (
                              <td key={field} className="p-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={1}
                                  aria-label={t(
                                    field === "vocal_volume"
                                      ? "playlistEditor.vocalOf"
                                      : "playlistEditor.accompanimentOf",
                                    { title },
                                  )}
                                  value={Math.round((entry[field] ?? 1) * 100)}
                                  onChange={(event) =>
                                    updateVolume(
                                      entry.song_hash,
                                      field,
                                      event.target.value,
                                    )
                                  }
                                  className={`${control} w-20 tabular-nums`}
                                />
                              </td>
                            ))}
                            <td className="p-2">
                              {!song || unavailable?.includes(entry.song_hash)
                                ? t("playlistEditor.notReady")
                                : unavailable
                                  ? t("playlistEditor.ready")
                                  : t("playlistEditor.unchecked")}
                            </td>
                            <td className="p-2">
                              <div className="flex gap-1">
                                <button
                                  className={control}
                                  disabled={index === 0}
                                  aria-label={t("playlist.moveUp")}
                                  onClick={() => move(index, index - 1)}
                                >
                                  ↑
                                </button>
                                <button
                                  className={control}
                                  disabled={index === entries.length - 1}
                                  aria-label={t("playlist.moveDown")}
                                  onClick={() => move(index, index + 1)}
                                >
                                  ↓
                                </button>
                                <button
                                  className={control}
                                  disabled={
                                    currentSnapshot?.song_id !==
                                      entry.song_hash ||
                                    !currentSnapshot.has_stems
                                  }
                                  onClick={() => {
                                    const mix =
                                      usePlayerStore.getState().snapshot
                                        ?.stem_volumes;
                                    if (mix)
                                      change(
                                        entries.map((other) =>
                                          other.song_hash === entry.song_hash
                                            ? {
                                                ...other,
                                                vocal_volume: mix.vocals,
                                                accompaniment_volume: Math.max(
                                                  mix.drums,
                                                  mix.bass,
                                                  mix.other,
                                                ),
                                              }
                                            : other,
                                        ),
                                      );
                                  }}
                                >
                                  {t("playlistEditor.capture")}
                                </button>
                              </div>
                            </td>
                          </SortableRow>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </SortableContext>
            </DndContext>
            {unavailable && unavailable.length > 0 && (
              <button
                className={control}
                onClick={() => {
                  setBusy(true);
                  void api.maintenance
                    .batchSeparate(unavailable)
                    .then(() =>
                      setMessage(t("playlistEditor.separationStarted")),
                    )
                    .catch(() => setError(t("playlistEditor.checkFailed")))
                    .finally(() => setBusy(false));
                }}
              >
                {t("playlistEditor.separate")}
              </button>
            )}
          </fieldset>
        </div>
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--color-border)] p-4">
          <span className="mr-auto text-xs text-[var(--color-text-dim)]">
            {dirty || textEdited
              ? t("playlistEditor.unsaved")
              : t("playlistEditor.savedSnapshot")}
          </span>
          <button
            className={control}
            disabled={busy || !loaded || !local || !entries.length}
            onClick={() => void check()}
          >
            {t("playlistEditor.check")}
          </button>
          <button
            className={control}
            disabled={
              busy ||
              !loaded ||
              !local ||
              dragged !== null ||
              textEdited ||
              !dirty
            }
            onClick={() => void save()}
          >
            {t("common.save")}
          </button>
          <button
            className={control}
            style={{
              backgroundColor: "var(--color-accent)",
              color: "var(--color-on-accent)",
            }}
            disabled={
              busy ||
              !loaded ||
              !local ||
              dirty ||
              textEdited ||
              !expected.length ||
              dragged !== null
            }
            onClick={() => void start()}
          >
            {t("playlistEditor.start")}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
