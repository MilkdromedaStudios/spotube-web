/**
 * Read-only Spotify catalogue adapter for the public wolfXspotify metadata API.
 *
 * wolfXspotify returns simplified objects ({ title, thumbnail, artist, ... })
 * in a { success, results | track | album | artist | playlist } envelope.
 * Normalize those into the Spotify Web API shapes the existing UI expects.
 *
 * Never request /api/token or send third-party tokens to Spotify. Playback
 * remains in the existing official Spotify Embed / connected Premium adapters.
 */
import { ApiError, cached, upstreamError } from "./http";

const BASE = "https://spotify.xwolf.space/api";
const ID = "[A-Za-z0-9]{22}";
type Data = Record<string, unknown>;
const obj = (v: unknown): Data => v && typeof v === "object" && !Array.isArray(v) ? v as Data : {};
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const str = (v: unknown): string => typeof v === "string" ? v : "";
const number = (v: unknown): number | undefined => typeof v === "number" && Number.isFinite(v) ? v : undefined;
const text = (v: unknown, fallback = ""): string => str(v) || fallback;
const spotifyUrl = (kind: string, id: string) => `https://open.spotify.com/${kind}/${id}`;
const clamp = (v: string | null, fallback: number, max = 50) =>
  Math.min(max, Math.max(0, Number.isFinite(Number(v)) && v !== null ? Math.floor(Number(v)) : fallback));

function images(v: unknown): { url: string; width?: number }[] {
  if (typeof v === "string" && v) return [{ url: v }];
  return list(v).map((raw) => {
    const item = obj(raw);
    return { url: str(item.url), width: number(item.width) };
  }).filter((item) => !!item.url);
}

function artistNames(v: unknown, fallback?: unknown): { id: string; name: string }[] {
  const original = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  const names = original.map((item) => {
    const value = obj(item);
    return typeof item === "string"
      ? { id: "", name: item.trim() }
      : { id: str(value.id), name: text(value.name, str(obj(value.profile).name)) };
  }).filter((item) => !!item.name);
  if (names.length || !str(fallback)) return names;
  return str(fallback).split(",").map((name) => ({ id: "", name: name.trim() })).filter((a) => !!a.name);
}

function track(raw: unknown, album?: Data) {
  const item = obj(raw);
  const id = str(item.id);
  const albumData = typeof item.album === "string" ? { id: "", name: item.album } : obj(item.album);
  const actualAlbum = Object.keys(albumData).length ? albumData : album;
  const albumId = str(actualAlbum?.id);
  const albumName = str(actualAlbum?.name);
  const thumbnail = text(item.thumbnail, text(item.artwork, str(actualAlbum?.thumbnail)));
  const uri = `spotify:track:${id}`;
  return {
    id,
    name: text(item.title, str(item.name)),
    artists: artistNames(item.artists, item.artist),
    album: albumName ? {
      id: albumId, name: albumName,
      images: images(thumbnail || actualAlbum?.images),
    } : undefined,
    duration_ms: number(item.duration_ms),
    explicit: item.explicit === true,
    uri,
    type: "track",
    external_urls: { spotify: text(item.url, spotifyUrl("track", id)) },
  };
}

function album(raw: unknown, withTracks = false) {
  const item = obj(raw);
  const id = str(item.id);
  const sourceTracks = list(item.tracks);
  const result = {
    id,
    name: str(item.name),
    artists: artistNames(item.artists, item.artist),
    images: images(item.thumbnail || item.images),
    release_date: str(item.release_date),
    total_tracks: number(item.total_tracks) ?? sourceTracks.length,
    external_urls: { spotify: text(item.url, spotifyUrl("album", id)) },
  };
  return withTracks ? {
    ...result,
    tracks: { items: sourceTracks.map((t) => track(t, item)), next: null },
  } : result;
}

function artist(raw: unknown) {
  const item = obj(raw);
  const id = str(item.id);
  return {
    id,
    name: str(item.name),
    images: images(item.thumbnail || item.images),
    followers: { total: number(item.followers) ?? 0 },
    external_urls: { spotify: text(item.url, spotifyUrl("artist", id)) },
  };
}

function playlist(raw: unknown) {
  const item = obj(raw);
  const id = str(item.id);
  return {
    id,
    name: str(item.name),
    description: str(item.description),
    owner: { display_name: typeof item.owner === "string" ? item.owner : text(obj(item.owner).display_name) },
    images: images(item.thumbnail || item.images),
    tracks: { total: number(item.total_tracks) ?? list(item.tracks).length },
    external_urls: { spotify: text(item.url, spotifyUrl("playlist", id)) },
  };
}

async function wolf(endpoint: string, params?: URLSearchParams): Promise<Data> {
  const url = `${BASE}/${endpoint}${params?.size ? `?${params}` : ""}`;
  return cached(`wolf:${url}`, 300, async () => {
    let response: Response;
    try {
      response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
    } catch {
      throw new ApiError(502, "upstream_error", "Spotify catalogue service is currently unreachable.");
    }
    if (!response.ok) throw await upstreamError("Spotify catalogue", response);
    let data: Data;
    try {
      data = obj(await response.json());
    } catch {
      throw new ApiError(502, "upstream_error", "Spotify catalogue returned invalid JSON.");
    }
    if (data.success === false) {
      throw new ApiError(502, "upstream_error", text(data.error, "Spotify catalogue request failed."));
    }
    return data;
  });
}

async function search(q: string, type: string, limit: number, offset: number): Promise<unknown[]> {
  const params = new URLSearchParams({ q, type, limit: String(limit), offset: String(offset) });
  try {
    const response = await wolf("search", params);
    return list(response.results);
  } catch (error) {
    // The service uses 404 to mean an ordinary empty search result.
    if (error instanceof ApiError && error.status === 404) return [];
    throw error;
  }
}

/** Compatible read-only subset of the Spotify Web API used by this app. */
export async function wolfCatalog(path: string, params: URLSearchParams): Promise<unknown> {
  const limit = Math.max(1, clamp(params.get("limit"), 20));
  const offset = clamp(params.get("offset"), 0, 100000);
  if (path === "/v1/search") {
    const q = (params.get("q") ?? "").trim();
    if (!q || q.length > 200) throw new ApiError(400, "bad_request", "Enter a valid Spotify search query.");
    const valid = new Set(["track", "album", "artist", "playlist"]);
    const types = [...new Set((params.get("type") ?? "track").split(","))].filter((t) => valid.has(t));
    if (!types.length) throw new ApiError(400, "bad_request", "Unsupported Spotify search type.");
    const entries = await Promise.all(types.map(async (type) => {
      const raw = await search(q, type, limit, offset);
      const items = raw.map(type === "track" ? (t) => track(t) : type === "album" ? (a) => album(a) : type === "artist" ? (a) => artist(a) : (p) => playlist(p));
      return [`${type}s`, { items }] as const;
    }));
    return Object.fromEntries(entries);
  }

  let match: RegExpMatchArray | null;
  if ((match = path.match(new RegExp(`^/v1/tracks/(${ID})$`)))) {
    const data = await wolf(`track/${match[1]}`);
    return track(data.track);
  }
  if ((match = path.match(new RegExp(`^/v1/albums/(${ID})(/tracks)?$`)))) {
    const data = await wolf(`album/${match[1]}`);
    const item = obj(data.album);
    const full = album(item, true);
    if (!match[2]) return full;
    const tracks = list(obj(obj(full).tracks).items);
    return { items: tracks.slice(offset, offset + limit), next: offset + limit < tracks.length ? "more" : null };
  }
  if ((match = path.match(new RegExp(`^/v1/artists/(${ID})(/top-tracks|/albums)?$`)))) {
    const id = match[1];
    if (match[2] === "/top-tracks") {
      const data = await wolf(`artist/${id}/top-tracks`);
      return { tracks: list(data.tracks).map((t) => track(t)) };
    }
    if (match[2] === "/albums") {
      const options = new URLSearchParams({
        type: "all", limit: String(limit), offset: String(offset),
      });
      const data = await wolf(`artist/${id}/albums`, options);
      return { items: list(data.albums).map((a) => album(a)) };
    }
    const data = await wolf(`artist/${id}`);
    return artist(data.artist);
  }
  if ((match = path.match(new RegExp(`^/v1/playlists/(${ID})(/items|/tracks)?$`)))) {
    const data = await wolf(`playlist/${match[1]}`);
    const item = obj(data.playlist);
    if (!match[2]) return playlist(item);
    const allTracks = list(item.tracks);
    const items = allTracks.slice(offset, offset + limit).map((t) => ({ track: track(t) }));
    return { items, next: offset + limit < allTracks.length ? "more" : null };
  }
  // wolfXspotify does not expose the official browse/new-releases endpoint.
  if (path === "/v1/browse/new-releases") return { albums: { items: [] } };
  throw new ApiError(400, "bad_request", "Unsupported Spotify catalogue path.");
}
