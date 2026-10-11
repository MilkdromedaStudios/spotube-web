import { env } from "./env";
import { ApiError, upstreamError } from "./http";
import { wolfCatalog } from "./wolfSpotify";

const ACCOUNTS = "https://accounts.spotify.com";
export const SPOTIFY_API = "https://api.spotify.com";

export const SPOTIFY_SCOPES = [
  "user-read-private",
  "user-read-email",
  "streaming",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-library-read",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-top-read",
];

function credentials() {
  const id = env("SPOTIFY_CLIENT_ID");
  const secret = env("SPOTIFY_CLIENT_SECRET");
  if (!id || !secret)
    throw new ApiError(503, "not_configured", "Spotify needs SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET on the server.");
  return { id, secret, basic: btoa(`${id}:${secret}`) };
}

export const clientId = () => credentials().id;

/**
 * Read-only metadata lookup. Prefer the public wolfXspotify service, but do
 * not make the entire site depend on its uptime. When Cloudflare has the app's
 * normal Spotify CLIENT_ID/SECRET, use the official Client Credentials flow as
 * a metadata-only backup; it does not sign users in or enable audio downloads.
 */
let appToken: { value: string; expiresAt: number } | null = null;
let tokenPending: Promise<string> | null = null;

async function spotifyAppToken(): Promise<string> {
  if (appToken && appToken.expiresAt > Date.now() + 60_000) return appToken.value;
  if (tokenPending) return tokenPending;
  tokenPending = (async () => {
    const { basic } = credentials();
    let response: Response;
    try {
      response = await fetch(`${ACCOUNTS}/api/token`, {
        method: "POST",
        headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "client_credentials" }),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new ApiError(502, "upstream_error", "Spotify's official token service is unreachable.");
    }
    if (!response.ok) throw await upstreamError("Spotify app credentials", response);
    const data = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) throw new ApiError(502, "upstream_error", "Spotify returned no app access token.");
    appToken = {
      value: data.access_token,
      expiresAt: Date.now() + Math.max(0, data.expires_in ?? 3600) * 1000,
    };
    return appToken.value;
  })().finally(() => { tokenPending = null; });
  return tokenPending;
}

const CATALOG_PATH = /^\\/v1\\/(?:search|tracks\\/[A-Za-z0-9]{22}|albums\\/[A-Za-z0-9]{22}(?:\\/tracks)?|artists\\/[A-Za-z0-9]{22}(?:\\/(?:top-tracks|albums))?|playlists\\/[A-Za-z0-9]{22}(?:\\/(?:items|tracks))?|browse\\/new-releases)$/;

async function officialCatalog(path: string, params: URLSearchParams): Promise<unknown> {
  // Keep this a strict, read-only allowlist: the client must never pick an
  // arbitrary URL or use the server's Spotify app credentials for user data.
  if (!CATALOG_PATH.test(path)) throw new ApiError(400, "bad_request", "Unsupported Spotify catalogue path.");
  const url = new URL(path, SPOTIFY_API);
  url.search = params.toString();
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await spotifyAppToken();
    let response: Response;
    try {
      response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new ApiError(502, "upstream_error", "Spotify's official catalogue is unreachable.");
    }
    if (response.status === 401 && attempt === 0) {
      appToken = null;
      continue;
    }
    if (!response.ok) throw await upstreamError("Spotify official API", response);
    try {
      return await response.json();
    } catch {
      throw new ApiError(502, "upstream_error", "Spotify's official API returned invalid JSON.");
    }
  }
  throw new ApiError(502, "upstream_error", "Spotify rejected the app token.");
}

/** oEmbed is public and can still identify a pasted track without app keys. */
async function publicTrack(path: string): Promise<unknown> {
  const match = /^\\/v1\\/tracks\\/([A-Za-z0-9]{22})$/.exec(path);
  if (!match) return null;
  const id = match[1];
  const url = new URL("https://open.spotify.com/oembed");
  url.searchParams.set("url", `https://open.spotify.com/track/${id}`);
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  try {
    const data = (await response.json()) as { title?: string; thumbnail_url?: string };
    if (!data.title) return null;
    const title = data.title.trim();
    // Spotify may use "Track by Artist" in oEmbed. If it does not, preserve
    // the complete title instead of guessing or attributing to a wrong artist.
    const matchTitle = /^(.*?) by (.+)$/i.exec(title);
    return {
      id,
      name: matchTitle ? matchTitle[1] : title,
      artists: matchTitle ? [{ id: "", name: matchTitle[2] }] : [],
      album: data.thumbnail_url ? { id: "", name: "", images: [{ url: data.thumbnail_url }] } : undefined,
      type: "track",
      uri: `spotify:track:${id}`,
      external_urls: { spotify: `https://open.spotify.com/track/${id}` },
    };
  } catch {
    return null;
  }
}

export async function catalog(path: string, params: URLSearchParams): Promise<unknown> {
  try {
    return await wolfCatalog(path, params);
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) throw error;
    // The public API can time out, rate-limit, or change its JSON format.
    // A failing upstream must never silently be interpreted as empty results.
    if (env("SPOTIFY_CLIENT_ID") && env("SPOTIFY_CLIENT_SECRET")) {
      try {
        return await officialCatalog(path, params);
      } catch (officialError) {
        const reason = officialError instanceof Error ? officialError.message : "Unknown official API error.";
        throw new ApiError(502, "upstream_error", `Spotify catalogue failed on both services. Official API: ${reason}`);
      }
    }
    const track = await publicTrack(path);
    if (track) return track;
    const reason = error instanceof Error ? error.message : "The metadata provider is unavailable.";
    throw new ApiError(502, "upstream_error",
      `Spotify's free metadata service is unavailable: ${reason} Add valid SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in Cloudflare Pages to enable the official read-only fallback.`);
  }
}

/**
 * Spotify requires the authorization and token-exchange redirect_uri to be the
 * exact same URL registered in the Spotify Developer Dashboard. For production,
 * set SPOTIFY_REDIRECT_URI to the canonical site's HTTPS callback URL.
 */
export function redirectUri(origin: string): string {
  const configured = env("SPOTIFY_REDIRECT_URI")?.trim();
  if (!configured) return `${origin}/api/spotify/callback`;

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new ApiError(503, "not_configured", "SPOTIFY_REDIRECT_URI must be a full HTTPS URL ending in /api/spotify/callback.");
  }
  const loopback = parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]";
  if (
    (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) ||
    parsed.pathname !== "/api/spotify/callback" ||
    parsed.search !== "" || parsed.hash !== "" ||
    !!parsed.username || !!parsed.password
  ) {
    throw new ApiError(
      503, "not_configured",
      "SPOTIFY_REDIRECT_URI must be an HTTPS URL ending exactly in /api/spotify/callback (no query or trailing slash). For local development, use http://127.0.0.1 instead of localhost.",
    );
  }
  // Preserve the exact user-configured string; Spotify compares redirect URIs.
  return configured;
}

export function authorizeUrl(origin: string, state: string) {
  const { id } = credentials();
  const u = new URL(`${ACCOUNTS}/authorize`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", id);
  u.searchParams.set("scope", SPOTIFY_SCOPES.join(" "));
  u.searchParams.set("redirect_uri", redirectUri(origin));
  u.searchParams.set("state", state);
  return u.toString();
}

export interface SpotifyTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

async function tokenRequest(body: URLSearchParams): Promise<SpotifyTokens> {
  const { basic } = credentials();
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const err = await upstreamError("Spotify", res);
    if (res.status === 400) throw new ApiError(401, "unauthorized", "Spotify session expired. Connect your account again.");
    throw err;
  }
  return (await res.json()) as SpotifyTokens;
}

export const exchangeCode = (code: string, origin: string) =>
  tokenRequest(new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri(origin) }));

export const refresh = (refreshToken: string) =>
  tokenRequest(new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }));

export const SESSION_COOKIE = "sp_session";
export const STATE_COOKIE = "sp_oauth_state";
