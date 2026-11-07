# ADR 0047 — Store Playlist mix presets and install them before audio output

Date: 2026-11-07
Status: accepted

## Context

A show organizer needs a fixed song order and separate vocal and accompaniment
levels for each song. The player currently retains levels across songs. The
preload path can switch songs inside one audio callback. A UI update after
that switch cannot set the level for the first incoming sample.

## Decision

Add a batch editor to each local Playlist. It supports table edits and a
preview of tab-separated text. Save all entries in one transaction. Compare
the saved entries with the editor's original entries before a save. Reject a
stale edit without a partial write.

Store optional linear vocal and accompaniment gains on Playlist membership.
A missing preset retains ordinary playback behavior. The batch editor uses
100 percent for missing levels when the user saves its draft. Each song can
appear once in one Playlist.

Show playback copies the saved order and gains into the transient queue.
Later Playlist edits do not change that copy. Live level changes do not write
to the Playlist. Playback history retains the copied presets for previous-song
navigation. The master output level remains separate.

Load required local stems before a show track can emit audio. Carry gains and
stems together into decoded installation and prepared-track promotion. Apply
them under the existing controller lock through the PlaybackCoordinator.
Render a callback tail with the incoming stems and gains after a gapless swap.
Do not add database or file operations to the audio callback.

Suppress crossfade for show tracks without changing the saved global setting.
A normal track load ends that override. Check source and stem files before
show playback. A runtime load failure stops advancement and exposes the
existing retry and next-track controls. Never substitute original audio for
missing required stems.

## Consequences

- The new editor uses local data. It adds no network calls or telemetry.
- Text is data. The application never executes it. Ambiguous matches require
  an explicit song choice before the text can replace the draft.
- The queue remains transient. Show restart recovery and duplicate entries
  are outside this surface.
- Readiness checks detect absent files. Decode errors remain possible during
  playback and must fail visibly.
- The feature must verify sample values at a transition, including a callback
  that contains the end of one song and the start of the next song.
