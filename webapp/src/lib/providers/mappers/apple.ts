import type { AlbumSummary, ArtistSummary, PlaylistSummary, Track } from "@/lib/types";

/* Minimal shapes of Apple Music API resources. */
interface Artwork {
  url: string;
}
export interface AmSong {
  id: string;
  type: string;
  attributes?: {
    name: string;
    artistName: string;
    albumName?: string;
    artwork?: Artwork;
    durationInMillis?: number;
    url?: string;
    contentRating?: string;
    playParams?: { id: string; kind: string };
  };
  relationships?: { artists?: { data: { id: string }[] }; albums?: { data: { id: string }[] } };
}
export interface AmAlbum {
  id: string;
  attributes?: {
    name: string;
    artistName: string;
    artwork?: Artwork;
    releaseDate?: string;
    trackCount?: number;
    url?: string;
  };
  relationships?: { tracks?: { data: AmSong[] }; artists?: { data: { id: string }[] } };
}
export interface AmArtist {
  id: string;
  attributes?: { name: string; artwork?: Artwork; url?: string };
}
export interface AmPlaylist {
  id: string;
  attributes?: {
    name: string;
    curatorName?: string;
    artwork?: Artwork;
    description?: { standard?: string; short?: string };
    url?: string;
  };
  relationships?: { tracks?: { data: AmSong[] } };
}

export const artworkUrl = (a?: Artwork, size = 300) =>
  a?.url ? a.url.replace("{w}", String(size)).replace("{h}", String(size)).replace("{f}", "jpg") : undefined;

export function amSongToTrack(s: AmSong): Track | null {
  if (!s.attributes || (s.type && s.type !== "songs" && s.type !== "library-songs")) return null;
  const a = s.attributes;
  const artistId = s.relationships?.artists?.data?.[0]?.id;
  return {
    key: `apple:${s.id}`,
    provider: "apple",
    id: s.id,
    title: a.name,
    artists: [{ id: artistId, name: a.artistName }],
    album: a.albumName ? { id: s.relationships?.albums?.data?.[0]?.id, name: a.albumName } : undefined,
    artwork: artworkUrl(a.artwork),
    durationMs: a.durationInMillis,
    explicit: a.contentRating === "explicit",
    url: a.url,
    playbackRef: a.playParams?.id ?? s.id,
  };
}

export function amAlbumToSummary(al: AmAlbum): AlbumSummary {
  const a = al.attributes;
  return {
    key: `apple:${al.id}`,
    provider: "apple",
    id: al.id,
    name: a?.name ?? "Album",
    artists: a ? [{ id: al.relationships?.artists?.data?.[0]?.id, name: a.artistName }] : [],
    artwork: artworkUrl(a?.artwork),
    year: a?.releaseDate?.slice(0, 4),
    trackCount: a?.trackCount,
    url: a?.url,
  };
}

export function amArtistToSummary(ar: AmArtist): ArtistSummary {
  return {
    key: `apple:${ar.id}`,
    provider: "apple",
    id: ar.id,
    name: ar.attributes?.name ?? "Artist",
    artwork: artworkUrl(ar.attributes?.artwork),
    url: ar.attributes?.url,
  };
}

export function amPlaylistToSummary(p: AmPlaylist): PlaylistSummary {
  const a = p.attributes;
  return {
    key: `apple:${p.id}`,
    provider: "apple",
    id: p.id,
    name: a?.name ?? "Playlist",
    owner: a?.curatorName,
    description: a?.description?.standard?.replace(/<[^>]+>/g, "") ?? a?.description?.short,
    artwork: artworkUrl(a?.artwork),
    url: a?.url,
  };
}
