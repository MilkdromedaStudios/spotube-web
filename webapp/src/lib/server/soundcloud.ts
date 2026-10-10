import "server-only";
import { env } from "./env";
import { ApiError, cached, upstreamError } from "./http";
import {
  scPlaylistToSummary,
  scTrackToTrack,
  scUserToArtist,
  type ScPlaylist,
  type ScTrack,
  type ScUser,
} from "@/lib/providers/mappers/soundcloud";
import type { SearchResults, SearchType, Track } from "@/lib/types";

const API = "https://api.soundcloud.com";

let token: { value: string; expires: number } | null = null;

async function getToken() {
  if (token && token.expires > Date.now() + 60_000) return token.value;
  const id = env("SOUNDCLOUD_CLIENT_ID");
  const secret = env("SOUNDCLOUD_CLIENT_SECRET");
  if (!id || !secret)
    throw new ApiError(503, "not_configured", "SoundCloud search needs SOUNDCLOUD_CLIENT_ID and SOUNDCLOUD_CLIENT_SECRET on the server.");
  const res = await fetch("https://secure.soundcloud.com/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json; charset=utf-8",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw await upstreamError("SoundCloud", res);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return token.value;
}

async function sc<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    headers: { Authorization: `OAuth ${await getToken()}`, Accept: "application/json; charset=utf-8" },
  });
  if (!res.ok) throw await upstreamError("SoundCloud", res);
  return (await res.json()) as T;
}

type Page<T> = { collection: T[]; next_href?: string | null };
const tracksOf = (list: ScTrack[]) => list.map(scTrackToTrack).filter((t): t is Track => !!t);

export async function search(q: string, types: SearchType[], offset = 0) {
  return cached(`sc:search:${types.join(",")}:${q.toLowerCase()}:${offset}`, 1800, async () => {
    const r: SearchResults = { tracks: [], albums: [], artists: [], playlists: [] };
    await Promise.all([
      types.includes("tracks") &&
        sc<Page<ScTrack>>("/tracks", { q, limit: 20, offset, linked_partitioning: "true", access: "playable,preview" }).then(
          (p) => void (r.tracks = tracksOf(p.collection)),
        ),
      types.includes("artists") &&
        sc<Page<ScUser>>("/users", { q, limit: 8, linked_partitioning: "true" }).then(
          (p) => void (r.artists = p.collection.map(scUserToArtist)),
        ),
      (types.includes("playlists") || types.includes("albums")) &&
        sc<Page<ScPlaylist>>("/playlists", { q, limit: 12, linked_partitioning: "true", show_tracks: "false" }).then(
          (p) => void (r.playlists = p.collection.map(scPlaylistToSummary)),
        ),
    ]);
    return r;
  });
}

export async function playlist(id: string) {
  if (!/^\d+$/.test(id)) throw new ApiError(400, "bad_request", "Invalid playlist id.");
  return cached(`sc:playlist:${id}`, 1800, async () => {
    const p = await sc<ScPlaylist>(`/playlists/${id}`, { access: "playable,preview" });
    return { playlist: scPlaylistToSummary(p), tracks: tracksOf(p.tracks ?? []) };
  });
}

export async function user(id: string) {
  if (!/^\d+$/.test(id)) throw new ApiError(400, "bad_request", "Invalid user id.");
  return cached(`sc:user:${id}`, 1800, async () => {
    const [u, tracks, playlists] = await Promise.all([
      sc<ScUser>(`/users/${id}`),
      sc<Page<ScTrack>>(`/users/${id}/tracks`, { limit: 30, linked_partitioning: "true", access: "playable,preview" }),
      sc<Page<ScPlaylist>>(`/users/${id}/playlists`, { limit: 12, linked_partitioning: "true", show_tracks: "false" }),
    ]);
    return {
      artist: scUserToArtist(u),
      topTracks: tracksOf(tracks.collection),
      playlists: playlists.collection.map(scPlaylistToSummary),
    };
  });
}

/** Resolves a soundcloud.com permalink to a track, playlist or user. */
export async function resolve(permalink: string) {
  const u = new URL(permalink);
  if (!["soundcloud.com", "www.soundcloud.com", "m.soundcloud.com", "on.soundcloud.com"].includes(u.hostname))
    throw new ApiError(400, "bad_request", "Not a SoundCloud link.");
  return cached(`sc:resolve:${permalink}`, 3600, async () => {
    const res = await sc<(ScTrack | ScPlaylist | ScUser) & { kind: string }>("/resolve", { url: permalink });
    if (res.kind === "track") return { kind: "track" as const, track: scTrackToTrack(res as ScTrack) };
    if (res.kind === "playlist")
      return { kind: "playlist" as const, playlist: scPlaylistToSummary(res as ScPlaylist), tracks: tracksOf((res as ScPlaylist).tracks ?? []) };
    if (res.kind === "user") return { kind: "artist" as const, artist: scUserToArtist(res as ScUser) };
    throw new ApiError(404, "not_found", "That SoundCloud link isn't a track, playlist or profile.");
  });
}
