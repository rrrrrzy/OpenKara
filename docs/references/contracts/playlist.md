# Playlist IPC contract

## Entries

`get_playlist_songs({ playlistId })` returns the saved entries in order. Each
entry has `song_hash`, `added_at` (Unix seconds), `sort_order`, `singer`,
`vocal_volume`, and `accompaniment_volume`. The two gain fields are nullable
linear values from 0 to 1. Older clients can omit them in an expected snapshot.

## Batch save

`save_playlist_songs({ playlistId, expected, entries })` returns no value.
`expected` is the original array from `get_playlist_songs`. `entries` is the
complete replacement array in playback order. Each submitted entry must have
both gains. Values must be finite and in range. Song hashes must be unique
and reference library songs. The backend assigns contiguous sort positions.

The backend compares `expected` with the saved entries in the same immediate
transaction that replaces the entries. A missing Playlist, a stale snapshot,
or an invalid entry rejects the whole save through the existing command error
model. It never commits a partial replacement. Existing add, remove, reorder,
and singer commands retain their arguments.

## Readiness

`check_playlist_ready({ songHashes })` returns the hashes that cannot start
show playback. Each song must have a local source file and nonempty required
stem files. Four-stem entries require vocals, drums, bass, and other. Two-stem
entries require vocals and accompaniment. This check does not decode files.
A later decode or file error can still fail playback.

## Editor text

Clipboard interchange uses tab-separated columns: `Title`, `Artist`, `Vocals`,
`Accompaniment`. Chinese headers are also accepted. Two columns select full
volume. Four columns require whole percentages from 0 to 100. Row order is
playback order. Empty lines are ignored. Matching uses trimmed title and
artist text. Multiple or absent matches require an explicit library-song
selection. Duplicate song choices prevent application. Text preview changes
only the editor draft until a batch save succeeds.
