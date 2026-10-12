import type { AlbumSummary, ArtistSummary, PlaylistSummary, Track } from "../../types";

/* Minimal shapes of Spotify Web API objects. */
export interface SpImage {
  url: string;
  width?: number | null;
}
export interface SpArtist {
  id: string;
  name: string;
  images?: SpImage[];
  followers?: { total?: number };
  external_urls?: { spotify?: string };
}
export interface SpAlbum {
  id: string;
  name: string;
  artists?: SpArtist[];
  images?: SpImage[];
  release_date?: string;
  total_tracks?: number;
  external_urls?: { spotify?: string };
  tracks?: { items: SpTrack[]; next?: string | null };
}
export interface SpTrack {
  id: string | null;
  name: string;
  artists: SpArtist[];
  album?: SpAlbum;
  duration_ms?: number;
  explicit?: boolean;
  uri?: string;
  type?: string;
  is_local?: boolean;
  external_urls?: { spotify?: string };
}
export interface SpPlaylist {
  id: string;
  name: string;
  description?: string | null;
  owner?: { display_name?: string | null; id?: string };
  images?: SpImage[] | null;
  tracks?: { total?: number };
  items?: { total?: number };
  external_urls?: { spotify?: string };
}

const pickImage = (images?: SpImage[] | null) => {
  if (!images?.length) return undefined;
  // Prefer a ~300px image to keep memory/bandwidth low
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (sorted.find((i) => (i.width ?? 0) >= 280) ?? sorted[sorted.length - 1]).url;
};

const decodeHtml = (s?: string | null) =>
  s ? s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'") : undefined;

export function spTrackToTrack(t: SpTrack, album?: SpAlbum): Track | null {
  if (!t || !t.id || t.is_local || (t.type && t.type !== "track")) return null;
  const al = t.album ?? album;
  return {
    key: `spotify:${t.id}`,
    provider: "spotify",
    id: t.id,
    title: t.name,
    artists: t.artists.map((a) => ({ id: a.id, name: a.name })),
    album: al ? { id: al.id, name: al.name } : undefined,
    artwork: pickImage(al?.images),
    durationMs: t.duration_ms,
    explicit: t.explicit,
    url: t.external_urls?.spotify ?? `https://open.spotify.com/track/${t.id}`,
    playbackRef: t.uri ?? `spotify:track:${t.id}`,
  };
}

export function spAlbumToSummary(a: SpAlbum): AlbumSummary {
  return {
    key: `spotify:${a.id}`,
    provider: "spotify",
    id: a.id,
    name: a.name,
    artists: (a.artists ?? []).map((x) => ({ id: x.id, name: x.name })),
    artwork: pickImage(a.images),
    year: a.release_date?.slice(0, 4),
    trackCount: a.total_tracks,
    url: a.external_urls?.spotify ?? `https://open.spotify.com/album/${a.id}`,
  };
}

export function spArtistToSummary(a: SpArtist): ArtistSummary {
  return {
    key: `spotify:${a.id}`,
    provider: "spotify",
    id: a.id,
    name: a.name,
    artwork: pickImage(a.images),
    followers: a.followers?.total,
    url: a.external_urls?.spotify ?? `https://open.spotify.com/artist/${a.id}`,
  };
}

export function spPlaylistToSummary(p: SpPlaylist): PlaylistSummary {
  return {
    key: `spotify:${p.id}`,
    provider: "spotify",
    id: p.id,
    name: p.name,
    owner: p.owner?.display_name ?? undefined,
    description: decodeHtml(p.description),
    artwork: pickImage(p.images),
    trackCount: p.tracks?.total ?? p.items?.total,
    url: p.external_urls?.spotify ?? `https://open.spotify.com/playlist/${p.id}`,
  };
}

/** Playlist item wrapper changed name from `track` to `item` in 2026; accept both. */
export function spPlaylistItemTrack(item: { track?: SpTrack | null; item?: SpTrack | null }) {
  return item.item ?? item.track ?? null;
}
