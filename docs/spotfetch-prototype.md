# SpotFetch-inspired MP3 metadata prototype

Route after deploying this branch: `/spotfetch-prototype` (also linked under Settings -> About).

## What I found in SpotFetch

[SpotFetch by MrElyazid](https://github.com/MrElyazid/SpotFetch) is a Python
program that takes track or playlist information, searches YouTube/YouTube
Music for corresponding audio, and uses yt-dlp, FFmpeg and tagging tools to
produce MP3/M4A/FLAC files. **The audio is not downloaded from Spotify.**
See SpotFetch's [README](https://github.com/MrElyazid/SpotFetch/blob/main/README.md)
and [functions.py](https://github.com/MrElyazid/SpotFetch/blob/main/files/functions.py).

SpotFetch is Copyright (C) 2025-2026 MrElyazid and distributed under
[GPL-2.0-or-later](https://github.com/MrElyazid/SpotFetch/blob/main/LICENSE).
Spotube Web is BSD-4-Clause. To avoid copying GPL-covered implementation
into Spotube Web, this proof of concept is independently written and
does not incorporate source code from SpotFetch.

## Prototype workflow

1. Paste a Spotify track URL/URI/ID and fetch its **catalogue metadata**
   using Spotube Web's existing read-only catalogue adapter.
2. View the Spotify song title, artists, album and official Spotify embed.
3. Select **your own or licensed MP3** from your device. It remains local.
4. Optionally edit title/artist/album and export a newly tagged MP3 file.

The code writes a minimal **ID3v2.4 UTF-8 tag**. Audio frames are not modified,
re-encoded, or uploaded. The original file stays untouched. Existing ID3v2
metadata in the downloaded copy is replaced, which can remove additional
frames (artwork, lyrics, replay-gain, etc). This is a prototype, not a complete
metadata editor. Do not use it on a valuable file without a backup.

## What it does NOT do

- It does not extract Spotify's protected audio or call a Spotify stream-ripping
  service. Spotify does **not** offer unrestricted MP3 downloads in its Web API.
- It does not use SpotFetch's yt-dlp / YouTube scraping implementation, which
  could download content without redistribution rights.
- It does not offer Spotify preview MP3s as downloadable files.
- It does not automatically locate matching licensed MP3s on a third-party
  provider; the user explicitly chooses the source audio.

Read [Spotify's Get Track API documentation](https://developer.spotify.com/documentation/web-api/reference/get-track)
for the developer policy on downloading Spotify content and preview limitations.

## Crediting and independence

**Credits:** SpotFetch by [MrElyazid](https://github.com/MrElyazid/SpotFetch)
inspired the overall metadata-to-audio tagging workflow.
No SpotFetch code was reused. Spotify marks and metadata are attributed to
Spotify, with a direct link to each identified track. Audio files remain the
responsibility of the person selecting them.

## Quick verification

1. Run `npm ci && npm run build`, or let your Cloudflare Pages preview build.
2. Open `/spotfetch-prototype` and paste a valid Spotify track link.
3. Upload a small **authorized MP3**, enter metadata, and download the result.
4. Inspect the downloaded file in a metadata-aware player (ID3v2.4 supported)
   to verify title, artist, album and preserved audio duration.
5. Confirm that the Network panel shows only the usual catalogue lookup; there
   is **no upload of the MP3** and **no MP3 request to Spotify**.
