<div align="center">
  <img width="96" src="public/spotube-logo.png" alt="Spotube Web logo">

# Spotube Web

An ad-free, account-free music player for the browser. It searches YouTube, Spotify, SoundCloud and Apple Music using provider integrations (Spotify
catalogue metadata via the public third-party wolfXspotify API), plays through official players,
and keeps your library in your own browser (IndexedDB).

</div>

Based on [Spotube](https://github.com/KRTirtho/spotube) by Kingkor Roy Tirtho. A static Next.js site plus one Cloudflare Pages
Function for `/api`.

## Deploy on Cloudflare Pages

1. **Workers & Pages → Create → Pages → Connect to Git**, pick this repository.
2. Framework preset **Next.js (Static HTML Export)** (build command `npx next build`, output directory `out`). Production
   branch `master`, root directory empty. **Save and Deploy.**
3. Project → **Settings → Variables and Secrets**, add the secrets you want (type *Secret*), then **Deployments → Retry
   deployment**:

| Name | Enables |
| --- | --- |
| `YOUTUBE_API_KEY` | YouTube search (YouTube Data API v3 key; recommended) |
| *(none)* | Spotify public catalogue search and playlist/album metadata via wolfXspotify (no key required) |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | Optional Spotify account sign-in and Premium SDK playback; redirect URI: `https://<your-domain>/api/spotify/callback` |
| `SESSION_SECRET` | Spotify sign-in (32+ random characters, `openssl rand -hex 32`) |
| `SOUNDCLOUD_CLIENT_ID`, `SOUNDCLOUD_CLIENT_SECRET` | SoundCloud search |
| `APPLE_MUSIC_TEAM_ID`, `APPLE_MUSIC_KEY_ID`, `APPLE_MUSIC_PRIVATE_KEY` | Apple Music (MusicKit key, whole .p8 contents) |
| `ALLOWED_ORIGINS`, `YOUTUBE_REGION_CODE`, `SPOTIFY_REDIRECT_URI` | Optional |

Every key is optional. Spotify public metadata search, album browsing, artist lookup, and public playlist
imports use the third-party [wolfXspotify API](https://spotify.xwolf.space/) without app credentials.
Its availability and data coverage depend on that external service, and it is not affiliated with Spotify.
No third-party token endpoint is used by Spotube Web. Spotify playback still uses Spotify's official
embed, or the Web Playback SDK with an authenticated Premium account. Without any provider keys,
local playlists and pasted music links still work. Visitors never configure anything.
If the build complains about Node, add a `NODE_VERSION` variable of `22`.

## Develop

```bash
npm install
npm run dev:api   # /api function on :8788 (put secrets in .dev.vars)
npm run dev       # site on :3000
npm run preview   # build and serve exactly like Cloudflare Pages
```

## License

BSD-4-Clause, same as Spotube. Copyright (c) 2025 Kingkor Roy Tirtho. This product includes software developed by Kingkor Roy
Tirtho. See [LICENSE](LICENSE). YouTube, Spotify, SoundCloud and Apple Music are trademarks of their owners; this project is not
affiliated with them.
