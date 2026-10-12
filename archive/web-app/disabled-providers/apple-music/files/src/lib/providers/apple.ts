"use client";

import { create } from "zustand";
import { apiGet, ProviderError } from "./api";
import {
  amAlbumToSummary,
  amArtistToSummary,
  amPlaylistToSummary,
  amSongToTrack,
  type AmAlbum,
  type AmArtist,
  type AmPlaylist,
  type AmSong,
} from "./mappers/apple";
import type { ProviderClient } from "./types";
import { getSettings } from "@/lib/settings";
import type { SearchType, Track } from "@/lib/types";

/* Minimal MusicKit JS v3 surface used by the app. */
export interface MusicKitInstance {
  isAuthorized: boolean;
  storefrontId?: string;
  volume: number;
  currentPlaybackTime: number;
  currentPlaybackDuration: number;
  playbackState: number;
  api: { music: (path: string, params?: Record<string, unknown>) => Promise<{ data: unknown }> };
  authorize(): Promise<string>;
  unauthorize(): Promise<void>;
  setQueue(opts: Record<string, unknown>): Promise<unknown>;
  play(): Promise<void>;
  pause(): void;
  stop(): void;
  seekToTime(seconds: number): Promise<void>;
  addEventListener(name: string, cb: (e: unknown) => void): void;
  removeEventListener(name: string, cb: (e: unknown) => void): void;
}

declare global {
  interface Window {
    MusicKit?: {
      configure(opts: Record<string, unknown>): Promise<MusicKitInstance>;
      getInstance(): MusicKitInstance;
      PlaybackStates: Record<string, number>;
    };
  }
}

export const useAppleAuth = create<{ authorized: boolean }>(() => ({ authorized: false }));

let loading: Promise<MusicKitInstance> | null = null;

/** Loads MusicKit lazily, only when Apple Music is actually used. */
export function getMusicKit(): Promise<MusicKitInstance> {
  if (loading) return loading;
  loading = (async () => {
    const { token } = await apiGet<{ token: string }>("/api/apple/token");
    if (!window.MusicKit) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new ProviderError("Apple Music couldn't load. Check your connection and try again.", "network")), 20000);
        document.addEventListener("musickitloaded", () => (clearTimeout(timer), resolve()), { once: true });
        const s = document.createElement("script");
        s.src = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
        s.async = true;
        s.onerror = () => (clearTimeout(timer), reject(new ProviderError("Apple Music couldn't load. Check your connection and try again.", "network")));
        document.head.appendChild(s);
      });
    }
    const music = await window.MusicKit!.configure({
      developerToken: token,
      app: { name: "Spotube Web", build: "0.1.0" },
    });
    useAppleAuth.setState({ authorized: music.isAuthorized });
    music.addEventListener("authorizationStatusDidChange", () => useAppleAuth.setState({ authorized: music.isAuthorized }));
    return music;
  })();
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

export async function authorizeApple() {
  const music = await getMusicKit();
  await music.authorize();
  useAppleAuth.setState({ authorized: music.isAuthorized });
}

export async function unauthorizeApple() {
  const music = await getMusicKit();
  await music.unauthorize();
  useAppleAuth.setState({ authorized: false });
}

async function am<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const music = await getMusicKit();
  const sf = music.storefrontId || getSettings().appleStorefront || "us";
  try {
    const res = await music.api.music(path.replace("{sf}", sf), params);
    return res.data as T;
  } catch (e) {
    const status = (e as { status?: number })?.status ?? 0;
    throw new ProviderError(
      status === 404 ? "Apple Music couldn't find that." : "Apple Music isn't responding right now. Try again in a little while.",
      status === 404 ? "not_found" : "upstream_error",
      status,
    );
  }
}

const TYPE_MAP: Record<SearchType, string> = { tracks: "songs", albums: "albums", artists: "artists", playlists: "playlists" };
const songs = (list?: AmSong[]) => (list ?? []).map(amSongToTrack).filter((t): t is Track => !!t);
const PAGE = 20;

export async function appleSong(id: string): Promise<Track | null> {
  const r = await am<{ data: AmSong[] }>(`/v1/catalog/{sf}/songs/${id}`, { include: "artists,albums" });
  return r.data[0] ? amSongToTrack(r.data[0]) : null;
}

export const apple: ProviderClient = {
  id: "apple",
  async search(q, types, page = 0) {
    const r = await am<{
      results: {
        songs?: { data: AmSong[]; next?: string };
        albums?: { data: AmAlbum[] };
        artists?: { data: AmArtist[] };
        playlists?: { data: AmPlaylist[] };
      };
    }>("/v1/catalog/{sf}/search", {
      term: q,
      types: types.map((t) => TYPE_MAP[t]).join(","),
      limit: PAGE,
      offset: Number(page) * PAGE,
    });
    return {
      tracks: songs(r.results.songs?.data),
      albums: (r.results.albums?.data ?? []).map(amAlbumToSummary),
      artists: (r.results.artists?.data ?? []).map(amArtistToSummary),
      playlists: (r.results.playlists?.data ?? []).map(amPlaylistToSummary),
      next: r.results.songs?.next ? Number(page) + 1 : undefined,
    };
  },
  async album(id) {
    const r = await am<{ data: AmAlbum[] }>(`/v1/catalog/{sf}/albums/${id}`);
    const a = r.data[0];
    if (!a) throw new ProviderError("Album not found", "not_found", 404);
    return { album: amAlbumToSummary(a), tracks: songs(a.relationships?.tracks?.data) };
  },
  async artist(id) {
    const r = await am<{
      data: (AmArtist & { views?: Record<string, { data: unknown[] }> })[];
    }>(`/v1/catalog/{sf}/artists/${id}`, { views: "top-songs,full-albums" });
    const a = r.data[0];
    if (!a) throw new ProviderError("Artist not found", "not_found", 404);
    return {
      artist: amArtistToSummary(a),
      topTracks: songs(a.views?.["top-songs"]?.data as AmSong[]),
      albums: ((a.views?.["full-albums"]?.data ?? []) as AmAlbum[]).map(amAlbumToSummary),
      playlists: [],
    };
  },
  async playlist(id) {
    const r = await am<{ data: AmPlaylist[] }>(`/v1/catalog/{sf}/playlists/${id}`);
    const p = r.data[0];
    if (!p) throw new ProviderError("Playlist not found", "not_found", 404);
    return { playlist: amPlaylistToSummary(p), tracks: songs(p.relationships?.tracks?.data) };
  },
};
