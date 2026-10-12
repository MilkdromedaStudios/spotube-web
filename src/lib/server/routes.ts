// Server code and everything it imports use relative paths (no "@/" alias), so the Pages Function
// bundles the same way with any Wrangler version.
import { parseMusicLink } from "../providers/links";
import { deleteCookie, getCookie, setCookie } from "./cookies";
import { bindEnv, env, providersConfigured } from "./env";
import { ApiError, errorJson, json, requireParam, sameOrigin } from "./http";
import { resolveLink } from "./oembed";
import { parseTypes } from "./params";
import { randomToken, seal, unseal } from "./seal";
import * as soundcloud from "./soundcloud";
import { SESSION_COOKIE, STATE_COOKIE, authorizeUrl, catalog, exchangeCode, redirectUri, refresh } from "./spotify";
import * as youtube from "./youtube";

/**
 * The server side of Spotube Web: a handful of endpoints under /api that need
 * a secret (provider API keys, the Spotify client secret). They return
 * metadata only; audio is never fetched or proxied.
 *
 * Served by the Cloudflare Pages Function in `functions/api/[[path]].ts`.
 */
type Handler = (req: Request, url: URL) => Promise<Response>;

const SESSION_MAX_AGE = 60 * 60 * 24 * 60;
const cookieBase = (url: URL) => ({ httpOnly: true, secure: url.protocol === "https:", sameSite: "lax" as const, path: "/api/spotify" });

const get: Record<string, Handler> = {
  /** Which providers this deployment has credentials for. Never returns secrets. */
  config: async (_req, url) => {
    // The redirect URI is public configuration, not a secret. Expose its exact
    // value so developers can allowlist it in the Spotify Developer Dashboard.
    let spotifyRedirectUri: string | null = null;
    let spotifyRedirectError: string | null = null;
    try {
      spotifyRedirectUri = redirectUri(url.origin);
    } catch (error) {
      spotifyRedirectError = error instanceof Error ? error.message : "Invalid Spotify redirect URI.";
    }
    return json({ providers: providersConfigured(), spotifyRedirectUri, spotifyRedirectError, spotifyClientId: env("SPOTIFY_CLIENT_ID") ?? null });
  },

  resolve: async (req, url) => {
    sameOrigin(req);
    const link = parseMusicLink(requireParam(url, "url"));
    if (!link) throw new ApiError(400, "bad_request", "That isn't a YouTube, Spotify or SoundCloud link.");
    return json(await resolveLink(link), { maxAge: 3600 });
  },

  "youtube/search": async (req, url) => {
    sameOrigin(req);
    const q = requireParam(url, "q");
    return json(await youtube.search(q, parseTypes(url), url.searchParams.get("pageToken") ?? undefined), { maxAge: 3600 });
  },
  "youtube/playlist": async (req, url) => {
    sameOrigin(req);
    const id = requireParam(url, "id", /^[A-Za-z0-9_-]{10,64}$/);
    return json(await youtube.playlist(id, url.searchParams.get("pageToken") ?? undefined), { maxAge: 1800 });
  },
  "youtube/channel": async (req, url) => {
    sameOrigin(req);
    return json(await youtube.channel(requireParam(url, "id", /^UC[A-Za-z0-9_-]{22}$/)), { maxAge: 3600 });
  },
  "youtube/trending": async (req, url) => {
    sameOrigin(req);
    const region = url.searchParams.get("region") ?? undefined;
    return json(await youtube.trending(region && /^[A-Za-z]{2}$/.test(region) ? region : undefined), { maxAge: 3 * 3600 });
  },

  "soundcloud/search": async (req, url) => {
    sameOrigin(req);
    const offset = Math.max(0, Math.min(1000, Number(url.searchParams.get("offset")) || 0));
    return json(await soundcloud.search(requireParam(url, "q"), parseTypes(url), offset), { maxAge: 1800 });
  },
  "soundcloud/playlist": async (req, url) => {
    sameOrigin(req);
    return json(await soundcloud.playlist(requireParam(url, "id", /^\d+$/)), { maxAge: 1800 });
  },
  "soundcloud/user": async (req, url) => {
    sameOrigin(req);
    return json(await soundcloud.user(requireParam(url, "id", /^\d+$/)), { maxAge: 1800 });
  },

  /** Read-only Spotify catalog proxy for visitors who haven't connected an account. */
  "spotify/catalog": async (req, url) => {
    sameOrigin(req);
    const path = requireParam(url, "path");
    const params = new URLSearchParams(url.searchParams);
    params.delete("path");
    return json(await catalog(path, params), { maxAge: 3600 });
  },

  /** Starts the Spotify authorization-code flow. */
  "spotify/login": async (_req, url) => {
    const callback = new URL(redirectUri(url.origin));
    if (callback.origin !== url.origin) {
      // Preview domains cannot share OAuth state cookies with the production
      // domain. Start the flow on the canonical host BEFORE setting the cookie.
      const canonicalLogin = new URL("/api/spotify/login", callback.origin);
      return new Response(null, {
        status: 307,
        headers: { Location: canonicalLogin.toString(), "Cache-Control": "no-store" },
      });
    }
    const state = randomToken();
    await seal("probe"); // fail early with a clear message if SESSION_SECRET is missing
    const headers = new Headers({ Location: authorizeUrl(url.origin, state), "Cache-Control": "no-store" });
    setCookie(headers, STATE_COOKIE, state, { ...cookieBase(url), maxAge: 600 });
    return new Response(null, { status: 307, headers });
  },

  /**
   * OAuth callback. The refresh token is encrypted into an HttpOnly cookie that
   * page scripts can't read; it is never written to IndexedDB.
   */
  "spotify/callback": async (req, url) => {
    const back = async (status: string, refreshToken?: string) => {
      const headers = new Headers({ Location: `${url.origin}/settings?spotify=${status}#providers`, "Cache-Control": "no-store" });
      deleteCookie(headers, STATE_COOKIE, "/api/spotify");
      if (refreshToken) setCookie(headers, SESSION_COOKIE, await seal(refreshToken), { ...cookieBase(url), maxAge: SESSION_MAX_AGE });
      return new Response(null, { status: 307, headers });
    };
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (url.searchParams.get("error")) return back("denied");
    if (!code || !state || state !== getCookie(req, STATE_COOKIE)) return back("invalid_state");
    try {
      const tokens = await exchangeCode(code, url.origin);
      if (!tokens.refresh_token) return back("error");
      return back("connected", tokens.refresh_token);
    } catch (e) {
      console.error(e);
      return back("error");
    }
  },
};

const post: Record<string, Handler> = {
  /**
   * Exchanges the HttpOnly session cookie for a short-lived access token that
   * the page keeps in memory only.
   */
  "spotify/token": async (req, url) => {
    const signedOut = (error?: string) => {
      const res = json(error ? { connected: false, error } : { connected: false });
      deleteCookie(res.headers, SESSION_COOKIE, "/api/spotify");
      return res;
    };
    sameOrigin(req);
    const sealed = getCookie(req, SESSION_COOKIE);
    if (!sealed) return json({ connected: false });
    const refreshToken = await unseal(sealed);
    if (!refreshToken) return signedOut();
    try {
      const tokens = await refresh(refreshToken);
      const res = json({ connected: true, accessToken: tokens.access_token, expiresIn: tokens.expires_in, scope: tokens.scope ?? "" });
      if (tokens.refresh_token && tokens.refresh_token !== refreshToken) {
        setCookie(res.headers, SESSION_COOKIE, await seal(tokens.refresh_token), { ...cookieBase(url), maxAge: SESSION_MAX_AGE });
      }
      return res;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return signedOut("Spotify session expired.");
      throw e;
    }
  },

  "spotify/logout": async (req) => {
    sameOrigin(req);
    const res = json({ ok: true });
    deleteCookie(res.headers, SESSION_COOKIE, "/api/spotify");
    return res;
  },
};

/** Dispatches a request for `/api/<route>`. `values` are the Pages environment variables and secrets. */
export async function handleApi(req: Request, values?: Record<string, unknown>): Promise<Response> {
  bindEnv(values);
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  const table = req.method === "GET" || req.method === "HEAD" ? get : req.method === "POST" ? post : undefined;
  const fn = table?.[route];
  let res: Response;
  if (fn) {
    try {
      res = await fn(req, url);
    } catch (e) {
      res = errorJson(e);
    }
  } else if (route in get || route in post) {
    res = json({ error: { code: "bad_request", message: "Method not allowed." } }, { status: 405 });
  } else {
    res = json({ error: { code: "not_found", message: "Unknown API endpoint." } }, { status: 404 });
  }
  res.headers.set("X-Robots-Tag", "noindex");
  return res;
}
