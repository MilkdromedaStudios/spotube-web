# Deploying Spotube Web to Cloudflare

Spotube Web runs as a single **Cloudflare Worker** built with the [OpenNext Cloudflare adapter](https://opennext.js.org/cloudflare).
Static files (JS, CSS, icons) are served by Workers Static Assets; the Worker only runs for page shells and the small `/api/*`
endpoints. There is no database to provision: user data lives in each visitor's browser (IndexedDB). HTTPS is automatic on
`*.workers.dev` and on custom domains.

> Why Workers and not Pages? Cloudflare now recommends Workers (with static assets) for full-stack frameworks, and OpenNext
> targets it. Everything is static where possible: pages are client-rendered shells and only the API routes run code.

## 1. Prerequisites

- A Cloudflare account (the free plan is enough to start).
- Node.js 20+.
- From the `webapp/` folder: `npm install`.
- Log in once: `npx wrangler login`.

## 2. Configure the Worker

`wrangler.jsonc` already contains the Worker definition. Change `"name"` (and the matching `services[0].service`) if you want a
different Worker name or `*.workers.dev` subdomain.

Non-secret settings can go under `"vars"` in `wrangler.jsonc` (for example `YOUTUBE_REGION_CODE`). Everything else is a secret.

## 3. Add secrets (only for the providers you want)

```bash
npx wrangler secret put YOUTUBE_API_KEY
npx wrangler secret put SPOTIFY_CLIENT_ID
npx wrangler secret put SPOTIFY_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET          # openssl rand -hex 32
npx wrangler secret put SOUNDCLOUD_CLIENT_ID
npx wrangler secret put SOUNDCLOUD_CLIENT_SECRET
npx wrangler secret put APPLE_MUSIC_TEAM_ID
npx wrangler secret put APPLE_MUSIC_KEY_ID
npx wrangler secret put APPLE_MUSIC_PRIVATE_KEY  # paste the full .p8 file contents
npx wrangler secret put ALLOWED_ORIGINS          # optional, e.g. https://music.example.com
```

You can also set them in the dashboard: **Workers & Pages → spotube-web → Settings → Variables and Secrets**. See
[`.env.example`](.env.example) for what each one does and where to get it.

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

## 4. Preview locally in the Workers runtime

```bash
cp .env.example .dev.vars   # fill in what you need; .dev.vars is git-ignored
npm run cf:preview          # builds and serves on http://localhost:8787
```

## 5. Deploy

```bash
npm run cf:deploy
```

The first deploy prints your `https://spotube-web.<account>.workers.dev` URL.

### Custom domain

Dashboard → **Workers & Pages → spotube-web → Settings → Domains & Routes → Add → Custom domain**, or add to `wrangler.jsonc`:

```jsonc
"routes": [{ "pattern": "music.example.com", "custom_domain": true }]
```

Remember to update the Spotify redirect URI and `ALLOWED_ORIGINS` to the new domain.

## 6. Continuous deployment (optional)

Connect the repository in **Workers & Pages → Create → Import a repository** and keep the default settings (root
directory `/`, no build command, deploy command `npx wrangler deploy`, non-production deploy command
`npx wrangler versions upload`). The `wrangler.jsonc` at the repository root builds `webapp/` and deploys it; without that
file Wrangler would detect the Flutter `web/` folder as a static site and deploy it instead. Keep the root `wrangler.jsonc`
and `webapp/wrangler.jsonc` in sync.

You can also point the build at the app folder instead (**spotube-web → Settings → Build**):

- Root directory (path): `webapp`
- Build command: `npx opennextjs-cloudflare build`
- Deploy command: `npx opennextjs-cloudflare deploy`
- Non-production branch deploy command (preview builds for pull requests): `npx opennextjs-cloudflare upload`

Either way the Worker name must match `"name"` in `wrangler.jsonc` (`spotube-web`). Node.js 22 is selected by
`.node-version`. Provider secrets are only needed at runtime (step 3), not as build variables.

You can also deploy from GitHub Actions by adding a job that runs `npm ci && npm run cf:deploy` in `webapp/` with a `CLOUDFLARE_API_TOKEN`
(Workers Scripts: Edit) and `CLOUDFLARE_ACCOUNT_ID` secret. The included `webapp-ci.yml` workflow already builds and tests every
pull request that touches `webapp/`.

## How requests are handled

| Path                         | Runs                                  | Notes                                                       |
| ---------------------------- | ------------------------------------- | ----------------------------------------------------------- |
| `/_next/static/*`, icons     | Static assets                         | Immutable, cached by Cloudflare                             |
| Any page, e.g. `/playlist/x` | Worker (page shell)                   | Direct navigation to every route works                      |
| `/api/config`                | Worker                                | Which providers are configured (booleans only)              |
| `/api/youtube/*`, `/api/soundcloud/*`, `/api/spotify/catalog` | Worker | Metadata only, cached in `caches.default`             |
| `/api/spotify/login`, `callback`, `token`, `logout` | Worker         | OAuth with an encrypted HttpOnly cookie                     |
| `/api/apple/token`           | Worker                                | Signs a MusicKit developer token with WebCrypto             |
| `/api/resolve`               | Worker                                | Turns a share link into track metadata (oEmbed or API)      |

No endpoint fetches, proxies or stores audio. Playback always happens in the providers' official players in the visitor's
browser.

## Troubleshooting

- **"Search needs …" messages:** the matching secrets aren't set. Check `/api/config` on your deployment.
- **Spotify "invalid_state" or "error" after connecting:** the redirect URI in the Spotify dashboard must match exactly, and
  `SESSION_SECRET` must be at least 32 characters.
- **Apple Music "not a valid .p8 private key":** paste the whole file including the `BEGIN/END PRIVATE KEY` lines. In
  single-line env files, write newlines as `\n`.
- **YouTube "rate limit" / 403:** the daily quota is used up; it resets at midnight Pacific Time.
