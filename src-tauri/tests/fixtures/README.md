# Test Fixtures

This directory stores tiny audio fixtures used by integration tests. The
metadata fixtures cover MP3, FLAC, and M4A so Phase 1 import work can be
verified without relying on external downloads or local sample libraries.

The `audio/` fixtures add WAV and OGG coverage for Phase 2 decode tests.

## Embedded lyrics

The `lyrics/` fixtures use 0.2 seconds of generated silence. They contain no
recorded music. `embedded.lrc` supplies Chinese text, two timestamp precisions,
repeated-line timestamps, and a negative offset.

FFmpeg 7.1 (`Lavf61.7.100`) generated `ffmpeg-v3.mp3` and `ffmpeg-v4.mp3` with
ID3v2.3 and ID3v2.4 tags. Both store lyrics in a `TXXX` frame with the `USLT`
description. Lofty maps this description to `ItemKey::UnsyncLyrics`. Tests
also construct real `USLT` frames with UTF-16 and UTF-8 text, independent of
Lofty's tag writer. Tests do not invoke FFmpeg.

From the repository root, use FFmpeg 7.1 to regenerate the MP3 files:

```sh
for version in 3 4; do
  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i anullsrc=r=44100:cl=mono -t 0.2 -c:a libmp3lame \
    -id3v2_version "$version" \
    -metadata "lyrics=$(cat src-tauri/tests/fixtures/lyrics/embedded.lrc)" \
    "src-tauri/tests/fixtures/lyrics/ffmpeg-v${version}.mp3"
done
```
