# Deploying Spotube Web to Cloudflare Pages

Spotube Web is a static site plus one small Pages Function for `/api`. Cloudflare Pages builds it from this repository on every
push. There is no database to set up: each visitor's library lives in their own browser (IndexedDB). HTTPS is automatic on
`*.pages.dev` and on custom domains.

## 1. Create the Pages project

1. In the Cloudflare dashboard open **Workers & Pages → Create → Pages → Connect to Git** and pick this repository.
2. **Framework preset:** `Next.js (Static HTML Export)`. That fills in:
   - Build command: `npx next build`
   - Build output directory: `out`

   (Setting the build command to `npm run build` and the output directory to `out` by hand does the same.)
3. Leave the root directory empty and the production branch as `master`.
4. **Save and Deploy.** The first build takes a couple of minutes and prints your `https://<project>.pages.dev` URL.

Cloudflare picks up `functions/api/[[path]].ts` automatically and serves it at `/api/*`, and `public/_headers` sets the security
headers. Nothing else needs configuring.

> **Already have a Worker called spotube-web from an earlier setup?** Delete it (**Workers & Pages → spotube-web (Worker) →
> Settings → Delete**) or at least disconnect its Git repository, otherwise it keeps building on every push and keeps serving
> its old page at `*.workers.dev`.

## 2. Add secrets (only for the providers you want)

Open the Pages project → **Settings → Variables and Secrets → Add**, choose type **Secret**, and add any of:

| Name                                   | Enables                                                     |
| -------------------------------------- | ----------------------------------------------------------- |
| `YOUTUBE_API_KEY`                      | YouTube search, playlists, channels, trending (recommended) |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | Spotify search and catalog                            |
| `SESSION_SECRET`                       | Spotify sign-in (32+ random characters: `openssl rand -hex 32`) |
| `SOUNDCLOUD_CLIENT_ID`, `SOUNDCLOUD_CLIENT_SECRET` | SoundCloud search                               |
| `APPLE_MUSIC_TEAM_ID`, `APPLE_MUSIC_KEY_ID`, `APPLE_MUSIC_PRIVATE_KEY` | Apple Music                 |
| `ALLOWED_ORIGINS`                      | Optional: restrict Apple developer tokens to your site      |
| `YOUTUBE_REGION_CODE`                  | Optional: trending region (default `US`)                    |

Pages applies variable changes to the **next** deployment, so afterwards open **Deployments** and choose **Retry deployment**
on the latest one (or push a commit). [`.env.example`](.env.example) explains where to get each value.

### Provider setup notes

- **YouTube:** in Google Cloud, enable *YouTube Data API v3*, create an API key and restrict it to that API. Quota is 10,000 units
  per day by default (one search = 100 units); request more in the console if needed.
- **Spotify:** in the [Spotify developer dashboard](https://developer.spotify.com/dashboard) create an app with the *Web API* and
  *Web Playback SDK* enabled and add the redirect URI `https://<your-domain>/api/spotify/callback`. New apps start in
  development mode, where only users you add under *User Management* can connect their account; apply for an extension to open
  it up. Searching without connecting works for everyone.
- **SoundCloud:** register an app at <https://soundcloud.com/you/apps> if registration is open to you.
- **Apple Music:** create a MusicKit key in your Apple Developer account. The server signs short-lived developer tokens from it;
  set `ALLOWED_ORIGINS` to your site's origin to restrict their use.

## 3. Custom domain (optional)

Pages project → **Custom domains → Set up a custom domain**. Afterwards update the Spotify redirect URI and `ALLOWED_ORIGINS` to
the new domain.

## Deploying without Git (optional)

```bash
npx wrangler login
npm run deploy        # builds and uploads out/ with the function; asks to create the project the first time
```

Secrets can then also be set with `npx wrangler pages secret put YOUTUBE_API_KEY`.

## Preview locally

```bash
cp .env.example .dev.vars   # fill in what you need; .dev.vars is git-ignored
npm run preview             # builds and serves on http://localhost:8788 with Cloudflare's Pages runtime
```

## How requests are handled

| Path                                                   | Served by                 | Notes                                                  |
| ------------------------------------------------------ | ------------------------- | ------------------------------------------------------ |
| Pages (`/`, `/search`, `/playlist?id=…`, …) and assets | Static files              | Every page is a plain HTML file; links work directly   |
| `/api/config`                                          | Pages Function            | Which providers are configured (booleans only)         |
| `/api/youtube/*`, `/api/soundcloud/*`, `/api/spotify/catalog` | Pages Function     | Metadata only, cached in `caches.default`              |
| `/api/spotify/login`, `callback`, `token`, `logout`    | Pages Function            | OAuth with an encrypted HttpOnly cookie                |
| `/api/apple/token`                                     | Pages Function            | Signs a MusicKit developer token with WebCrypto        |
| `/api/resolve`                                         | Pages Function            | Turns a share link into track metadata (oEmbed or API) |

No endpoint fetches, proxies or stores audio. Playback always happens in the providers' official players in the visitor's
browser.

## Troubleshooting

- **"Search needs …" messages:** the matching secrets aren't set, or were added after the latest deployment. Check
  `/api/config` on your site and retry the latest deployment.
- **Build fails with a Node.js version error:** set a `NODE_VERSION` variable of `22` in the Pages project settings (Next.js 16
  needs Node 20.9 or newer; current Pages build images default to Node 22).
- **Spotify "invalid_state" or "error" after connecting:** the redirect URI in the Spotify dashboard must match exactly, and
  `SESSION_SECRET` must be at least 32 characters.
- **Apple Music "not a valid .p8 private key":** paste the whole file including the `BEGIN/END PRIVATE KEY` lines.
- **YouTube "rate limit" / 403:** the daily quota is used up; it resets at midnight Pacific Time.
