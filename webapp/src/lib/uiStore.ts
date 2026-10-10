"use client";

import { create } from "zustand";
import type { CollectionItemType } from "@/lib/db/schema";
import type { AlbumSummary, ArtistSummary, Track } from "@/lib/types";

export interface CollectionTarget {
  type: CollectionItemType;
  key: string;
  name: string;
  payload?: { track?: Track; album?: AlbumSummary; artist?: ArtistSummary };
}

interface UiState {
  addToPlaylist: Track[] | null;
  addToCollection: CollectionTarget | null;
  shortcutsOpen: boolean;
  sidebarOpen: boolean;
}

export const useUi = create<UiState>(() => ({
  addToPlaylist: null,
  addToCollection: null,
  shortcutsOpen: false,
  sidebarOpen: false,
}));

export const openAddToPlaylist = (tracks: Track[]) => useUi.setState({ addToPlaylist: tracks });
export const openAddToCollection = (target: CollectionTarget) => useUi.setState({ addToCollection: target });
