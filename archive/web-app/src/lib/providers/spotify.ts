"use client";

import { create } from "zustand";
import { apiGet, ProviderError } from "./api";
import {
  spAlbumToSummary,
  spArtistToSummary,
  spPlaylistItemTrack,
  spPlaylistToSummary,
  spTrackToTrack,
  type SpAlbum,
  type SpArtist,
  type SpPlaylist,
  type SpTrack,
} from "./mappers/spotify";
import type { ProviderClient } from "./types";
import type { SearchResults, SearchType, Track } from "@/lib/types";

interface SpotifyAuthState {
  checked: boolean;
  connected: boolean;
  /** "premium" | "free" | ... once the profile is loaded */
  product?: string;
  displayName?: string;
  country?: string;
  scope: string;
}

export const useSpotifyAuth = create<SpotifyAuthState>(() => ({ checked: false, connected: false, scope: "" }));

// Access token is held in memory only. The refresh token lives in an encrypted HttpOnly cookie.
let token: { value: string; expires: number } | null = null;
let inflight: Promise<string | null> | null = null;

export async function getUserToken(force = false): Promise<string | null> {
  if (!force && token && token.expires > Date.now() + 30_000) return token.value;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/spotify/token", { method: "POST" });
      const body = (await res.json()) as { connected?: boolean; accessToken?: string; expiresIn?: number; scope?: string };
      if (!res.ok || !body.connected || !body.accessToken) {
        token = null;
        useSpotifyAuth.setState({ checked: true, connected: false, product: undefined, displayName: undefined });
        return null;
      }
      token = { value: body.accessToken, expires: Date.now() + (body.expiresIn ?? 3600) * 1000 };
      const first = !useSpotifyAuth.getState().connected;
      useSpotifyAuth.setState({ checked: true, connected: true, scope: body.scope ?? "" });
      if (first) void loadProfile(body.accessToken);
      return token.value;
    } catch {
      useSpotifyAuth.setState({ checked: true });
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

async function loadProfile(accessToken: string) {
  try {
    const res = await fetch("https://api.spotify.com/v1/me", { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return;
    const me = (await res.json()) as { product?: string; display_name?: string; country?: string };
    useSpotifyAuth.setState({ product: me.product, displayName: me.display_name, country: me.country });
  } catch {
    /* optional */
  }
}

export async function disconnectSpotify() {
  await fetch("/api/spotify/logout", { method: "POST" });
  token = null;
  useSpotifyAuth.setState({ connected: false, product: undefined, displayName: undefined, scope: "" });
}

/** GET a Spotify Web API path, directly with the user's token or through the catalog proxy. */
export async function spGet<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  // Catalogue browsing always uses the public read-only metadata proxy; user
  // OAuth tokens are reserved for the user's private playlists and SDK playback.
  if (!path.startsWith("/v1/me/")) return apiGet<T>("/api/spotify/catalog", { path, ...params });
  const userToken = await getUserToken();
  if (!userToken) throw new ProviderError("Connect Spotify in Settings to view private account data.", "unauthorized", 401);
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  const doFetch = (t: string) =>
    fetch(`https://api.spotify.com${path}${qs.size ? `?${qs}` : ""}`, { headers: { Authorization: `Bearer ${t}` } });
  let res: Response;
  try {
    res = await doFetch(userToken);
    if (res.status === 401) {
      const fresh = await getUserToken(true);
      if (!fresh) throw new ProviderError("Spotify session expired. Connect again in Settings.", "unauthorized", 401);
      res = await doFetch(fresh);
    }
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError("Couldn't reach Spotify. Check your connection.", "network");
  }
  if (!res.ok) {
    let msg = "";
    try {
      msg = ((await res.json()) as { error?: { message?: string } }).error?.message ?? "";
    } catch {
      /* ignore */
    }
    console.warn(`[Spotube Web] Spotify ${path} failed (${res.status}): ${msg}`);
    if (res.status === 429) throw new ProviderError("Spotify is busy right now. Try again in a minute.", "rate_limited", 429);
    if (res.status === 404) throw new ProviderError("Spotify couldn't find that.", "not_found", 404);
    throw new ProviderError("Spotify isn't responding right now. Try again in a little while.", "upstream_error", res.status);
  }
  return (await res.json()) as T;
}

const TYPE_MAP: Record<SearchType, string> = { tracks: "track", albums: "album", artists: "artist", playlists: "playlist" };
const PAGE = 10; // Spotify limits search page size for development-mode apps

const tracks = (list: (SpTrack | null)[], album?: SpAlbum) =>
  list.map((t) => (t ? spTrackToTrack(t, album) : null)).filter((t): t is Track => !!t);

async function playlistTracks(id: string, max = 500): Promise<Track[]> {
  const out: Track[] = [];
  let useItems = true;
  for (let offset = 0; offset < max; offset += 50) {
    let page: { items: { track?: SpTrack | null; item?: SpTrack | null }[]; next: string | null };
    try {
      page = await spGet(`/v1/playlists/${id}/${useItems ? "items" : "tracks"}`, { limit: 50, offset });
    } catch (e) {
      // Older API deployments only expose /tracks.
      if (useItems && e instanceof ProviderError && (e.status === 404 || e.status === 400)) {
        useItems = false;
        offset -= 50;
        continue;
      }
      throw e;
    }
    out.push(...tracks(page.items.map(spPlaylistItemTrack)));
    if (!page.next) break;
  }
  return out;
}

export const spotify: ProviderClient = {
  id: "spotify",
  async search(q, types, page = 0) {
    const data = await spGet<{
      tracks?: { items: (SpTrack | null)[] };
      albums?: { items: (SpAlbum | null)[] };
      artists?: { items: (SpArtist | null)[] };
      playlists?: { items: (SpPlaylist | null)[] };
    }>("/v1/search", { q, type: types.map((t) => TYPE_MAP[t]).join(","), limit: PAGE, offset: Number(page) * PAGE });
    const results: SearchResults = {
      tracks: tracks(data.tracks?.items ?? []),
      albums: (data.albums?.items ?? []).filter((a): a is SpAlbum => !!a).map(spAlbumToSummary),
      artists: (data.artists?.items ?? []).filter((a): a is SpArtist => !!a).map(spArtistToSummary),
      playlists: (data.playlists?.items ?? []).filter((p): p is SpPlaylist => !!p).map(spPlaylistToSummary),
    };
    const more = types.some((t) => results[t].length === PAGE);
    return { ...results, next: more ? Number(page) + 1 : undefined };
  },
  async album(id) {
    const a = await spGet<SpAlbum>(`/v1/albums/${id}`);
    const list = tracks(a.tracks?.items ?? [], a);
    let next = a.tracks?.next;
    let offset = list.length;
    while (next && offset < 500) {
      const page = await spGet<{ items: SpTrack[]; next: string | null }>(`/v1/albums/${id}/tracks`, { limit: 50, offset });
      list.push(...tracks(page.items, a));
      offset += page.items.length;
      next = page.next;
      if (!page.items.length) break;
    }
    return { album: spAlbumToSummary(a), tracks: list };
  },
  async artist(id) {
    const [artist, top, albums] = await Promise.all([
      spGet<SpArtist>(`/v1/artists/${id}`),
      spGet<{ tracks: SpTrack[] }>(`/v1/artists/${id}/top-tracks`).catch(() => ({ tracks: [] as SpTrack[] })),
      spGet<{ items: SpAlbum[] }>(`/v1/artists/${id}/albums`, { include_groups: "album,single", limit: 20 }).catch(() => ({
        items: [] as SpAlbum[],
      })),
    ]);
    let topTracks = tracks(top.tracks);
    if (!topTracks.length) {
      // top-tracks isn't available to every app; fall back to a search for the artist's songs.
      const s = await spGet<{ tracks?: { items: SpTrack[] } }>("/v1/search", {
        q: `artist:"${artist.name}"`,
        type: "track",
        limit: PAGE,
      }).catch(() => ({ tracks: { items: [] as SpTrack[] } }));
      topTracks = tracks(s.tracks?.items ?? []);
    }
    return { artist: spArtistToSummary(artist), topTracks, albums: albums.items.map(spAlbumToSummary), playlists: [] };
  },
  async playlist(id) {
    const p = await spGet<SpPlaylist>(`/v1/playlists/${id}`, { fields: "id,name,description,owner(display_name),images,external_urls,tracks(total),items(total)" });
    return { playlist: spPlaylistToSummary(p), tracks: await playlistTracks(id) };
  },
  async home() {
    const sections = [];
    if (useSpotifyAuth.getState().connected) {
      const [mine, top] = await Promise.all([
        spGet<{ items: SpPlaylist[] }>("/v1/me/playlists", { limit: 20 }).catch(() => null),
        spGet<{ items: SpTrack[] }>("/v1/me/top/tracks", { limit: 20, time_range: "short_term" }).catch(() => null),
      ]);
      if (top?.items.length) sections.push({ title: "Your top tracks on Spotify", tracks: tracks(top.items) });
      if (mine?.items.length)
        sections.push({ title: "Your Spotify playlists", playlists: mine.items.filter(Boolean).map(spPlaylistToSummary) });
    }
    const releases = await spGet<{ albums: { items: SpAlbum[] } }>("/v1/browse/new-releases", { limit: 20 }).catch(() => null);
    if (releases?.albums.items.length)
      sections.push({ title: "New releases on Spotify", albums: releases.albums.items.map(spAlbumToSummary) });
    return sections;
  },
};
