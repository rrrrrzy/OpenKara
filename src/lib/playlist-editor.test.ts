import { describe, expect, test } from "vite-plus/test";
import type { Song } from "@/types/ipc";
import { E2E_MOCK_DATA } from "@/mock/tauri-mock-data";
import {
  newPlaylistEntry,
  parsePlaylistText,
  resolvePlaylistText,
  serializePlaylistText,
} from "./playlist-editor";
const first: Song = {
  ...E2E_MOCK_DATA.songs[0],
  audio_source_kind: "original",
  media_g_container: null,
  has_cover_art: false,
  artwork_thumb_path: null,
};
const second: Song = {
  ...E2E_MOCK_DATA.songs[1],
  audio_source_kind: "original",
  media_g_container: null,
  has_cover_art: false,
  artwork_thumb_path: null,
};
const songs: Song[] = [first, second];

describe("playlist text", () => {
  test("copy and paste preserves order, levels and singer assignments", () => {
    const entries = [
      {
        ...newPlaylistEntry(second.hash),
        singer: "Guest",
        vocal_volume: 0,
        accompaniment_volume: 0.85,
      },
      { ...newPlaylistEntry(first.hash), vocal_volume: 0.3 },
    ];
    const rows = parsePlaylistText(
      serializePlaylistText(entries, songs),
      songs,
    );
    expect(resolvePlaylistText(rows, entries)).toEqual(
      entries.map((entry, sort_order) => ({ ...entry, sort_order })),
    );
  });
  test("two columns use full volume and tolerate CRLF and BOM", () => {
    const rows = parsePlaylistText(
      `\uFEFF歌曲\t歌手\r\n${first.title}\t${first.artist}\r\n`,
      songs,
    );
    expect(rows).toHaveLength(1);
    expect(resolvePlaylistText(rows, [])[0]).toMatchObject({
      song_hash: first.hash,
      vocal_volume: 1,
      accompaniment_volume: 1,
    });
  });
  test.each(["101", "-1", "0.5", "NaN", "", "1e2"])(
    "rejects invalid volume %s",
    (level) => {
      const rows = parsePlaylistText(
        `${first.title}\t${first.artist}\t${level}\t100`,
        songs,
      );
      expect(rows[0].error).toBe("volume");
      expect(() => resolvePlaylistText(rows, [])).toThrow();
    },
  );
  test("ambiguous and missing songs require an explicit selection", () => {
    const rows = parsePlaylistText(
      `${first.title}\t${first.artist}\nMissing\tUnknown`,
      [...songs, { ...first, hash: "alternate" }],
    );
    expect(rows[0].candidates).toHaveLength(2);
    expect(rows[0].songHash).toBe("");
    expect(rows[1].candidates).toHaveLength(0);
    expect(() => resolvePlaylistText(rows, [])).toThrow();
    rows[0].songHash = first.hash;
    rows[1].songHash = second.hash;
    expect(
      resolvePlaylistText(rows, []).map((entry) => entry.song_hash),
    ).toEqual([first.hash, second.hash]);
  });
  test("duplicate songs and malformed columns block application", () => {
    const text = `${first.title}\t${first.artist}`;
    expect(() =>
      resolvePlaylistText(parsePlaylistText(`${text}\n${text}`, songs), []),
    ).toThrow();
    expect(parsePlaylistText(`${text}\t100`, songs)[0].error).toBe("format");
  });
});
