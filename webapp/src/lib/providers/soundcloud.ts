"use client";

import { apiGet } from "./api";
import type { ArtistPage, ProviderClient } from "./types";
import type { PlaylistSummary, SearchResults, Track } from "@/lib/types";

const PAGE = 20;

export const soundcloud: ProviderClient = {
  id: "soundcloud",
  async search(q, types, page = 0) {
    const r = await apiGet<SearchResults>("/api/soundcloud/search", {
      q,
      types: types.join(","),
      offset: Number(page) * PAGE,
    });
    return { ...r, next: r.tracks.length === PAGE ? Number(page) + 1 : undefined };
  },
  async artist(id) {
    const r = await apiGet<Omit<ArtistPage, "albums">>("/api/soundcloud/user", { id });
    return { ...r, albums: [] };
  },
  playlist(id) {
    return apiGet<{ playlist: PlaylistSummary; tracks: Track[] }>("/api/soundcloud/playlist", { id });
  },
};
