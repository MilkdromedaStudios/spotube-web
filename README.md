<div align="center">
  <img width="96" src="public/spotube-logo.png" alt="Spotube Web logo">

# Spotube Web

An ad-free, account-free music player for the browser. It searches YouTube, Spotify, SoundCloud and Apple Music through their
official APIs, plays music through their official players, and keeps your library in your own browser.

</div>

Open the site and start listening: there is nothing to download or install, and no sign-up. Spotube Web is based on
[Spotube](https://github.com/KRTirtho/spotube) by Kingkor Roy Tirtho. This repository contains only the browser version; the
original desktop and mobile app lives in the upstream repository.

It is a static Next.js 16 + React 19 + TypeScript site with a small server API, hosted on **Cloudflare Pages**.

## Features

- **Providers:** YouTube (Data API v3 + IFrame Player API, including YouTube Music links), Spotify (Web API, optional account
  connection, Web Playback SDK for Premium, Embed for everyone else), SoundCloud (API + Widget API), Apple Music (MusicKit JS).
  Adding a provider means implementing `ProviderClient` and `PlaybackAdapter`.
- **Play any link** without API keys: paste a YouTube / YouTube Music / Spotify / SoundCloud track link (resolved with the
  providers' public oEmbed endpoints).
- **Player:** play/pause, previous/next, shuffle, repeat (off/all/one), queue with drag-and-drop, volume and mute, seek bar,
  artwork and metadata, full-screen now playing view, keyboard shortcuts (`?` lists them), Media Session (lock screen and
  hardware media keys), loading/buffering states, automatic retry and skip of unplayable tracks. Navigating between pages never
  restarts the song.
- **Library in IndexedDB:** playlists (cover upload, rename, description, reorder, import/export), liked songs, saved albums,
  favorite artists, custom collections, recently played, listening stats, resume positions for long tracks, queue and all
  settings. Full JSON backup/restore and a "clear all data" button.
- **Pages:** Home, Search (per provider, filter by songs/albums/artists/playlists, plus your library), Library, Liked Songs,
  playlist, album, artist, provider playlists (with "save a copy"), collections, Stats and Settings.
- **Privacy:** no ads, analytics, trackers or cookies of its own. A strict Content Security Policy only allows the official
  provider SDKs; SDKs load lazily; YouTube uses `youtube-nocookie.com` by default; artwork loads without a referrer (or not at
  all); listening history can be turned off.
- **No accounts:** provider sign-in is optional.

## Deploying

See **[DEPLOYMENT.md](DEPLOYMENT.md)**. In short: create a Cloudflare Pages project from this repository with the
"Next.js (Static HTML Export)" preset, then add a `YOUTUBE_API_KEY` secret so search works. Visitors never configure anything.

## Development

Requirements: Node.js 20.9+ and npm.

```bash
npm install
cp .env.example .dev.vars   # optional: provider keys for the local API
npm run dev:api             # terminal 1: the /api Pages Function on http://localhost:8788
npm run dev                 # terminal 2: the site on http://localhost:3000 (forwards /api to 8788)
```

With no keys at all you can still build playlists, import/export, and play pasted links. Each variable is documented in
[`.env.example`](.env.example).

| Command            | What it does                                                                          |
| ------------------ | ------------------------------------------------------------------------------------- |
| `npm run dev`      | Next.js dev server for the site                                                       |
| `npm run dev:api`  | Local Cloudflare Pages runtime for the `/api` function                                |
| `npm run build`    | Static export into `out/`                                                             |
| `npm run preview`  | Build, then serve `out/` and the function exactly as Cloudflare Pages does (port 8788) |
| `npm run deploy`   | Build and upload to Cloudflare Pages with Wrangler (optional; Git deploys need none)   |
| `npm run lint`     | TypeScript type check                                                                 |
| `npm test`         | Unit tests (Vitest + fake-indexeddb)                                                  |
| `npm run test:e2e` | Browser tests (Playwright, desktop + mobile) against the built site on the Pages runtime |

## How it fits together

```
src/app/              Pages (static, client-rendered). Item pages take query parameters, e.g. /playlist?id=…
src/components/       UI: shell, player bar, now playing, track lists, cards, dialogs
src/lib/db/           Dexie schema + migrations, library operations, backup, stats
src/lib/providers/    Provider clients (metadata), link parsing, response mappers
src/lib/player/       Playback engine (queue, history, persistence), adapters, Media Session
src/lib/server/       The /api endpoints: provider API calls, token signing, cookie sealing, caching
functions/api/        Cloudflare Pages Function that serves /api with the code in src/lib/server
public/_headers       Security headers (Content Security Policy and friends) for Cloudflare Pages
e2e/                  Playwright tests (with an offline YouTube IFrame API test double)
```

**The API** exists only where a secret is involved: provider search/metadata (API keys), the Spotify OAuth code exchange and
token refresh, and signing the Apple MusicKit developer token. It returns metadata only. No audio is ever proxied or stored.
Responses are cached at the edge (`caches.default`) to save API quota, and cross-site browser requests are rejected.

**Tokens:** the Spotify refresh token is AES-GCM encrypted (with `SESSION_SECRET`) into an HttpOnly, SameSite cookie scoped to
`/api/spotify`. Access tokens live only in memory. Nothing secret is written to IndexedDB. (MusicKit JS manages Apple's own
user token itself.)

**IndexedDB schema** (`src/lib/db/schema.ts`): `tracks`, `playlists`, `likes`, `albums`, `artists`, `collections`, `history`,
`resume`, `settings`, `player`. Version 2 adds a multi-entry word index for fast library search, collections and resume
positions, and its `upgrade()` backfills existing data; the migration is covered by tests. Add new versions instead of editing
old ones.

## About your data

Your library is stored in **this browser on this device only**. It does not sync between devices or browsers, private windows
start empty, and clearing site data (or the browser freeing space) deletes it. Use **Settings → Storage → Export** for backups,
and **Request persistent storage** to ask the browser not to evict it.

## Known limitations

- **Search needs API keys** on the server. Without them, only pasted links and your library work.
- **YouTube:** the Data API's default quota (10,000 units/day, 100 per search) is small for a public site; results are cached
  for an hour. Videos whose owners disabled embedding can't be played and are skipped. YouTube Music albums have no public API, so
  YouTube has no album pages. YouTube may show ads in its player.
- **Spotify:** full tracks need a connected **Premium** account (Web Playback SDK, desktop browsers; mobile Safari and some
  Android browsers are not supported by Spotify). Otherwise the Spotify embed plays 30-second previews, or full tracks when the
  listener is signed in to spotify.com in the same browser; it has no volume API. Spotify restricts development-mode apps (user
  allow-list, smaller search pages, some endpoints such as top tracks or editorial playlists may be unavailable); the UI reports
  those errors. Spotify Free may play ads.
- **SoundCloud:** API registration may be closed to new apps. Some tracks are preview-only or not embeddable. Without API keys,
  pasted track links work but playlist links do not.
- **Apple Music:** needs an Apple Developer MusicKit key. Full tracks need an Apple Music subscription; others hear previews.
- **Provider ads are never blocked.** The site itself is ad-free, but YouTube, SoundCloud and Spotify Free may show ads inside
  their official players. Spotube Web explains this in the player and settings.
- The official players must stay visible while they play (provider terms), so the player appears in a panel or dock.
- Background playback on mobile depends on the provider's embed and the browser; iOS may pause embedded players when the screen
  locks.
- The desktop app's plugin system, downloads, lyrics, Last.fm scrobbling, Discord presence and local files are not part of the
  web version.

## License

BSD-4-Clause, same as Spotube. Copyright (c) 2025 Kingkor Roy Tirtho. This product includes software developed by Kingkor Roy
Tirtho. See [LICENSE](LICENSE). YouTube, Spotify, SoundCloud and Apple Music are trademarks of their owners; this project is not
affiliated with them.
