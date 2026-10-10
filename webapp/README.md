# Spotube Web

A browser version of [Spotube](https://github.com/KRTirtho/spotube): an ad-free, account-free music player that searches
YouTube, Spotify, SoundCloud and Apple Music through their official APIs, plays music through their official players, and keeps
your library in your own browser with IndexedDB.

It is a Next.js 16 + React 19 + TypeScript app that deploys to **Cloudflare Workers** (via the OpenNext adapter). The original
Flutter app in the repository root is untouched and still builds for desktop and mobile.

## Why Next.js instead of Flutter Web

Spotube's Flutter code depends on native-only packages that have no browser equivalent: `media_kit` (libmpv), `sqlite3`/`drift`
with native libraries, `youtube_explode_dart`/`yt_dlp_dart`/NewPipe extractors (direct stream extraction, which is also blocked
by CORS and not permitted for this project), `flutter_inappwebview`, `window_manager`, `audio_service`, `bonsoir`, the Hetu
plugin runtime and more. Making it run in a browser would have meant replacing the audio, storage, provider and plugin layers
anyway, while still shipping a multi-megabyte canvas app. The web app therefore keeps Spotube's model and experience (provider-
agnostic "bring your own metadata" tracks, sidebar + bottom player layout, liked songs, playlists, stats, accent colors) and
re-implements it with browser APIs.

| Spotube (Flutter)                          | Spotube Web                                                                |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| Metadata plugins (Hetu scripts)            | `ProviderClient` interface per provider (`src/lib/providers`)              |
| `media_kit` audio + stream extraction      | Official players behind a `PlaybackAdapter` interface (`src/lib/player`)  |
| Drift / SQLite                             | Dexie (IndexedDB) with a versioned schema (`src/lib/db`)                   |
| `audio_service` / MPRIS / SMTC             | Media Session API                                                          |
| shadcn_flutter UI                          | Tailwind CSS, same dark theme and accent choices                           |

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
- **No accounts:** open the site and start using it. Provider sign-in is optional.

## Getting started

Requirements: Node.js 20+ and npm.

```bash
cd webapp
npm install
cp .env.example .env.local   # optional: add provider keys
npm run dev                  # http://localhost:3000
```

With no keys at all you can still build playlists, import/export, and play pasted links. Add keys to enable search; each
variable is documented in [`.env.example`](.env.example).

### Scripts

| Command              | What it does                                                         |
| -------------------- | -------------------------------------------------------------------- |
| `npm run dev`        | Next.js dev server                                                   |
| `npm run build`      | Production build (Node)                                              |
| `npm run lint`       | TypeScript type check                                                |
| `npm test`           | Unit tests (Vitest + fake-indexeddb)                                 |
| `npm run test:e2e`   | Browser tests (Playwright, desktop + mobile; builds must exist)     |
| `npm run cf:build`   | Build the Cloudflare Worker bundle into `.open-next/`                |
| `npm run cf:preview` | Build and run it locally in the Workers runtime (`wrangler dev`)     |
| `npm run cf:deploy`  | Build and deploy to Cloudflare                                       |

Run the browser tests against the Workers runtime with `BASE_URL=http://127.0.0.1:8787 npm run test:e2e` while
`npm run cf:preview` is running.

## Deploying to Cloudflare

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for the step-by-step guide (Workers via OpenNext, secrets, Spotify redirect URI,
custom domain, CI).

## How it fits together

```
src/
  app/                 Pages (App Router) and API route handlers (/api/*)
  components/          UI: shell, player bar, now playing, track lists, cards, dialogs
  lib/db/              Dexie schema + migrations, library operations, backup, stats
  lib/providers/       Provider clients (metadata), link parsing, response mappers
  lib/player/          Playback engine (queue, history, persistence), adapters, Media Session
  lib/server/          Server-only code: provider API calls, token signing, cookie sealing, caching
e2e/                   Playwright tests (with an offline YouTube IFrame API test double)
```

**Server endpoints** exist only where a secret is involved: provider search/metadata (API keys), the Spotify OAuth code exchange
and token refresh, and signing the Apple MusicKit developer token. They return metadata only. No audio is ever proxied or
stored. Responses are cached at the edge (`caches.default`) to save API quota, and cross-site browser requests are rejected.

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
- The Flutter app's plugin system, downloads, lyrics, Last.fm scrobbling, Discord presence and local files are not part of the web
  version.

## License

BSD-4-Clause, same as Spotube. Copyright (c) 2025 Kingkor Roy Tirtho. This product includes software developed by Kingkor Roy
Tirtho. See [LICENSE](LICENSE). YouTube, Spotify, SoundCloud and Apple Music are trademarks of their owners; this project is not
affiliated with them.
