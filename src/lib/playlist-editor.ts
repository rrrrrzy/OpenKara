import type { PlaylistSong } from "@/lib/backend";
import type { Song } from "@/types/ipc";
import { songDisplayTitle } from "./song-display";

export interface PlaylistTextRow {
  line: number;
  title: string;
  artist: string;
  vocal: number;
  accompaniment: number;
  candidates: Song[];
  songHash: string;
  error: "format" | "volume" | null;
}

export function newPlaylistEntry(hash: string): PlaylistSong {
  return {
    song_hash: hash,
    added_at: Math.floor(Date.now() / 1000),
    sort_order: 0,
    singer: null,
    vocal_volume: 1,
    accompaniment_volume: 1,
  };
}

export function parsePlaylistText(
  text: string,
  songs: Song[],
): PlaylistTextRow[] {
  let firstContentLine = true;
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .flatMap((line, index) => {
      if (!line.trim()) return [];
      const cells = line.split("\t").map((cell) => cell.trim());
      const isHeader =
        firstContentLine &&
        ((cells[0] === "Title" && cells[1] === "Artist") ||
          (["歌曲", "歌曲名稱"].includes(cells[0]) && cells[1] === "歌手"));
      firstContentLine = false;
      if (isHeader) return [];
      const [title, artist = "", vocal = "100", accompaniment = "100"] = cells;
      const validVolume = (value: string) =>
        /^\d{1,3}$/.test(value) && Number(value) <= 100;
      const candidates = songs.filter(
        (song) =>
          songDisplayTitle(song).trim() === title &&
          (song.artist ?? "").trim() === artist,
      );
      return [
        {
          line: index + 1,
          title,
          artist,
          vocal: Number(vocal),
          accompaniment: Number(accompaniment),
          candidates,
          songHash: candidates.length === 1 ? candidates[0].hash : "",
          error:
            !title || ![2, 4].includes(cells.length)
              ? "format"
              : !validVolume(vocal) || !validVolume(accompaniment)
                ? "volume"
                : null,
        },
      ];
    });
}

export function resolvePlaylistText(
  rows: PlaylistTextRow[],
  previous: PlaylistSong[],
): PlaylistSong[] {
  const seen = new Set<string>();
  return rows.map((row, index) => {
    if (row.error || !row.songHash || seen.has(row.songHash))
      throw new Error("Invalid playlist text");
    seen.add(row.songHash);
    return {
      ...(previous.find((entry) => entry.song_hash === row.songHash) ??
        newPlaylistEntry(row.songHash)),
      sort_order: index,
      vocal_volume: row.vocal / 100,
      accompaniment_volume: row.accompaniment / 100,
    };
  });
}

export function serializePlaylistText(
  entries: PlaylistSong[],
  songs: Song[],
): string {
  return [
    "Title\tArtist\tVocals\tAccompaniment",
    ...entries.map((entry) => {
      const song = songs.find(
        (candidate) => candidate.hash === entry.song_hash,
      );
      return [
        songDisplayTitle(song).replace(/[\t\r\n]/g, " "),
        (song?.artist ?? "").replace(/[\t\r\n]/g, " "),
        Math.round((entry.vocal_volume ?? 1) * 100),
        Math.round((entry.accompaniment_volume ?? 1) * 100),
      ].join("\t");
    }),
  ].join("\n");
}
