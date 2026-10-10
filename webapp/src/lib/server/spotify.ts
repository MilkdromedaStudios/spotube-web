import "server-only";
import { env } from "./env";
import { ApiError, cached, upstreamError } from "./http";

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

let appToken: { value: string; expires: number } | null = null;

/** Client-credentials token for catalog requests made without a connected account. */
export async function getAppToken(): Promise<string> {
  if (appToken && appToken.expires > Date.now() + 60_000) return appToken.value;
  const { basic } = credentials();
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw await upstreamError("Spotify", res);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  appToken = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return appToken.value;
}

const ID = "[A-Za-z0-9]{22}";
const ALLOWED_PATHS = [
  /^\/v1\/search$/,
  new RegExp(`^/v1/albums/${ID}(/tracks)?$`),
  new RegExp(`^/v1/artists/${ID}(/albums|/top-tracks)?$`),
  new RegExp(`^/v1/playlists/${ID}(/tracks|/items)?$`),
  new RegExp(`^/v1/tracks/${ID}$`),
  /^\/v1\/browse\/new-releases$/,
];
const ALLOWED_PARAMS = new Set(["q", "type", "limit", "offset", "market", "include_groups", "country", "fields", "additional_types"]);

/**
 * Proxies a read-only catalog request with the app token. Only metadata
 * endpoints are allowed; no audio is ever proxied.
 */
export async function catalog(path: string, search: URLSearchParams): Promise<unknown> {
  if (!ALLOWED_PATHS.some((re) => re.test(path))) throw new ApiError(400, "bad_request", "Unsupported Spotify path.");
  const qs = new URLSearchParams();
  for (const [k, v] of search) if (ALLOWED_PARAMS.has(k)) qs.set(k, v.slice(0, 200));
  if (!qs.has("market") && path !== "/v1/browse/new-releases") qs.set("market", "US");
  const url = `${SPOTIFY_API}${path}?${qs}`;
  return cached(`sp:${url}`, 3600, async () => {
    const token = await getAppToken();
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw await upstreamError("Spotify", res);
    return res.json();
  });
}

export function redirectUri(origin: string) {
  return env("SPOTIFY_REDIRECT_URI") || `${origin}/api/spotify/callback`;
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
