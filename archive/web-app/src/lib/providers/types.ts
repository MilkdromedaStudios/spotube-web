import type { AlbumSummary, ArtistSummary, PlaylistSummary, ProviderId, SearchResults, SearchType, Track } from "@/lib/types";

export interface HomeSection {
  title: string;
  tracks?: Track[];
  albums?: AlbumSummary[];
  playlists?: PlaylistSummary[];
  artists?: ArtistSummary[];
}

export interface ArtistPage {
  artist: ArtistSummary;
  topTracks: Track[];
  albums: AlbumSummary[];
  playlists: PlaylistSummary[];
}

/** Metadata side of a music provider. Playback lives in lib/player/adapters. */
export interface ProviderClient {
  id: ProviderId;
  search(q: string, types: SearchType[], page?: string | number): Promise<SearchResults & { next?: string | number }>;
  album?(id: string): Promise<{ album: AlbumSummary; tracks: Track[] }>;
  artist(id: string): Promise<ArtistPage>;
  playlist(id: string): Promise<{ playlist: PlaylistSummary; tracks: Track[] }>;
  home?(): Promise<HomeSection[]>;
}
