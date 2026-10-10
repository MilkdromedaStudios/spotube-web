/**
 * Core music model shared by every provider. Mirrors the provider-agnostic
 * "BYOMM" metadata model of the original Spotube app (lib/models/metadata),
 * flattened for the browser.
 */

export const PROVIDER_IDS = ["youtube", "spotify", "soundcloud", "apple"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface ArtistRef {
  id?: string;
  name: string;
}

export interface AlbumRef {
  id?: string;
  name: string;
}

export interface Track {
  /** Globally unique key: `${provider}:${id}` */
  key: string;
  provider: ProviderId;
  id: string;
  title: string;
  artists: ArtistRef[];
  album?: AlbumRef;
  artwork?: string;
  durationMs?: number;
  /** Public page for the track on the provider's site */
  url?: string;
  explicit?: boolean;
  /** Provider specific identifier used for playback (e.g. spotify:track:… URI, SoundCloud permalink) */
  playbackRef?: string;
}

export interface AlbumSummary {
  key: string;
  provider: ProviderId;
  id: string;
  name: string;
  artists: ArtistRef[];
  artwork?: string;
  year?: string;
  trackCount?: number;
  url?: string;
}

export interface ArtistSummary {
  key: string;
  provider: ProviderId;
  id: string;
  name: string;
  artwork?: string;
  followers?: number;
  url?: string;
}

export interface PlaylistSummary {
  key: string;
  provider: ProviderId;
  id: string;
  name: string;
  owner?: string;
  description?: string;
  artwork?: string;
  trackCount?: number;
  url?: string;
}

export type SearchType = "tracks" | "albums" | "artists" | "playlists";

export interface SearchResults {
  tracks: Track[];
  albums: AlbumSummary[];
  artists: ArtistSummary[];
  playlists: PlaylistSummary[];
}

export const emptyResults = (): SearchResults => ({
  tracks: [],
  albums: [],
  artists: [],
  playlists: [],
});

export const trackKey = (provider: ProviderId, id: string) => `${provider}:${id}`;

export function splitKey(key: string): { provider: ProviderId; id: string } {
  const i = key.indexOf(":");
  return { provider: key.slice(0, i) as ProviderId, id: key.slice(i + 1) };
}

export const artistNames = (t: { artists: ArtistRef[] }) =>
  t.artists.map((a) => a.name).join(", ");

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  youtube: "YouTube",
  spotify: "Spotify",
  soundcloud: "SoundCloud",
  apple: "Apple Music",
};

export function isProviderId(v: unknown): v is ProviderId {
  return typeof v === "string" && (PROVIDER_IDS as readonly string[]).includes(v);
}
