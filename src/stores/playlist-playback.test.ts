import { afterEach, expect, test, vi } from "vite-plus/test";
import { createPlayerStore } from "./player-store";
import { useQueueStore } from "./queue-store";
import { createMockBackend } from "@/lib/backend/mock-backend";
import { newPlaylistEntry } from "@/lib/playlist-editor";
import type { PlaybackStateSnapshot, StemVolumes } from "@/types/ipc";

afterEach(() => {
  useQueueStore.getState().setQueue([]);
  useQueueStore.getState().clearHistory();
});

test("show playback applies saved levels on automatic next and back, without saving live adjustments", async () => {
  let generation = 0;
  const snapshot = (id: string, mix?: StemVolumes): PlaybackStateSnapshot => ({
    song_id: id,
    transport_generation: ++generation,
    state: "playing",
    is_playing: true,
    position_ms: 0,
    duration_ms: 1000,
    buffered_ms: 1000,
    volume: 0.7,
    has_stems: true,
    stem_mode: "two_stem",
    stem_volumes: mix ?? { vocals: 1, drums: 1, bass: 1, other: 1 },
  });
  const play = vi.fn(async (id: string, mix?: StemVolumes) =>
    snapshot(id, mix),
  );
  const setStemVolume = vi.fn(async () =>
    snapshot("b", { vocals: 0.9, drums: 1, bass: 1, other: 1 }),
  );
  const backend = createMockBackend({
    overrides: { playback: { play, setStemVolume } },
  });
  const player = createPlayerStore(undefined, backend);
  const entries = [
    { ...newPlaylistEntry("a"), vocal_volume: 0 },
    { ...newPlaylistEntry("b"), vocal_volume: 0.3, accompaniment_volume: 0.85 },
  ];
  try {
    await player.store.getState().startPlaylist(entries);
    expect(play).toHaveBeenLastCalledWith("a", {
      vocals: 0,
      drums: 1,
      bass: 1,
      other: 1,
    });
    entries[1].vocal_volume = 1;
    await player.store.getState().playNextFromQueue("a");
    expect(play).toHaveBeenLastCalledWith("b", {
      vocals: 0.3,
      drums: 0.85,
      bass: 0.85,
      other: 0.85,
    });
    await player.store.getState().setStemVolume("vocals", 0.9);
    await player.store.getState().skipBack();
    expect(play).toHaveBeenLastCalledWith("a", {
      vocals: 0,
      drums: 1,
      bass: 1,
      other: 1,
    });
    await player.store.getState().skipForward();
    expect(play).toHaveBeenLastCalledWith("b", {
      vocals: 0.3,
      drums: 0.85,
      bass: 0.85,
      other: 0.85,
    });
    await player.store.getState().playNow("ordinary");
    expect(play).toHaveBeenLastCalledWith("ordinary");
    expect(useQueueStore.getState().playlistPresets).toEqual({});
  } finally {
    player.dispose();
  }
});
