import type { ArtistSummary, PlaylistSummary, Track } from "@/lib/types";

export interface ScUser {
  id: number;
  username: string;
  avatar_url?: string | null;
  followers_count?: number;
  permalink_url?: string;
}
export interface ScTrack {
  id: number;
  kind?: string;
  title: string;
  user?: ScUser;
  artwork_url?: string | null;
  duration?: number;
  full_duration?: number;
  permalink_url?: string;
  streamable?: boolean;
  access?: "playable" | "preview" | "blocked" | null;
  embeddable_by?: string;
  publisher_metadata?: { artist?: string; album_title?: string } | null;
}
export interface ScPlaylist {
  id: number;
  title: string;
  user?: ScUser;
  artwork_url?: string | null;
  track_count?: number;
  permalink_url?: string;
  description?: string | null;
  tracks?: ScTrack[];
}

const big = (url?: string | null) => (url ? url.replace("-large.", "-t500x500.") : undefined);

export function scTrackToTrack(t: ScTrack): Track | null {
  if (!t || (t.kind && t.kind !== "track") || t.access === "blocked" || t.embeddable_by === "none") return null;
  const artist = t.publisher_metadata?.artist || t.user?.username || "Unknown artist";
  return {
    key: `soundcloud:${t.id}`,
    provider: "soundcloud",
    id: String(t.id),
    title: t.title,
    artists: [{ id: t.user ? String(t.user.id) : undefined, name: artist }],
    album: t.publisher_metadata?.album_title ? { name: t.publisher_metadata.album_title } : undefined,
    artwork: big(t.artwork_url ?? t.user?.avatar_url),
    durationMs: t.full_duration ?? t.duration,
    url: t.permalink_url,
    playbackRef: t.permalink_url ?? `https://api.soundcloud.com/tracks/${t.id}`,
  };
}

export function scUserToArtist(u: ScUser): ArtistSummary {
  return {
    key: `soundcloud:${u.id}`,
    provider: "soundcloud",
    id: String(u.id),
    name: u.username,
    artwork: big(u.avatar_url),
    followers: u.followers_count,
    url: u.permalink_url,
  };
}

export function scPlaylistToSummary(p: ScPlaylist): PlaylistSummary {
  return {
    key: `soundcloud:${p.id}`,
    provider: "soundcloud",
    id: String(p.id),
    name: p.title,
    owner: p.user?.username,
    description: p.description ?? undefined,
    artwork: big(p.artwork_url ?? p.tracks?.[0]?.artwork_url ?? p.user?.avatar_url),
    trackCount: p.track_count,
    url: p.permalink_url,
  };
}
