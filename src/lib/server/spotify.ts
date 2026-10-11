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

/** Public, key-free, read-only Spotify metadata adapter. OAuth is only for user features/playback. */
export const catalog = wolfCatalog;

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
