"use client";

import { apiGet } from "./api";
import type { ArtistPage, HomeSection, ProviderClient } from "./types";
import type { PlaylistSummary, SearchResults, Track } from "@/lib/types";

export const youtube: ProviderClient = {
  id: "youtube",
  async search(q, types, page) {
    const r = await apiGet<SearchResults & { nextPageToken?: string }>("/api/youtube/search", {
      q,
      types: types.join(","),
      pageToken: typeof page === "string" ? page : undefined,
    });
    return { ...r, next: r.nextPageToken };
  },
  async artist(id) {
    const r = await apiGet<Omit<ArtistPage, "albums">>("/api/youtube/channel", { id });
    return { ...r, albums: [] };
  },
  async playlist(id) {
    let pageToken: string | undefined;
    let playlist: PlaylistSummary | null = null;
    const tracks: Track[] = [];
    // Load up to 500 entries (10 pages) to keep quota and memory bounded.
    for (let i = 0; i < 10; i++) {
      const r = await apiGet<{ playlist: PlaylistSummary | null; tracks: Track[]; nextPageToken: string | null }>(
        "/api/youtube/playlist",
        { id, pageToken },
      );
      playlist ??= r.playlist;
      tracks.push(...r.tracks);
      if (!r.nextPageToken) break;
      pageToken = r.nextPageToken;
    }
    return { playlist: playlist!, tracks };
  },
  async home(): Promise<HomeSection[]> {
    const r = await apiGet<{ tracks: Track[] }>("/api/youtube/trending");
    return r.tracks.length ? [{ title: "Trending music on YouTube", tracks: r.tracks }] : [];
  },
};
