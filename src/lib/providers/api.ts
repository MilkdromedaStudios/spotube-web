"use client";

import { create } from "zustand";
import type { ProviderId } from "@/lib/types";

export class ProviderError extends Error {
  constructor(
    message: string,
    public code: string = "upstream_error",
    public status = 0,
  ) {
    super(message);
  }
}

export async function apiGet<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
  let res: Response;
  try {
    res = await fetch(`${path}${qs.size ? `?${qs}` : ""}`, { headers: { Accept: "application/json" } });
  } catch {
    throw new ProviderError(
      typeof navigator !== "undefined" && !navigator.onLine ? "You're offline." : "Network error. Check your connection.",
      "network",
    );
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } })?.error;
    throw new ProviderError(err?.message ?? `Request failed (${res.status}).`, err?.code ?? "upstream_error", res.status);
  }
  return body as T;
}

export interface ServerConfig {
  youtube: boolean;
  spotify: boolean;
  spotifyLogin: boolean;
  soundcloud: boolean;
  apple: boolean;
}

interface ConfigState {
  loaded: boolean;
  error?: string;
  providers: ServerConfig;
  load: () => Promise<void>;
}

export const useServerConfig = create<ConfigState>((set) => ({
  loaded: false,
  providers: { youtube: false, spotify: false, spotifyLogin: false, soundcloud: false, apple: false },
  load: async () => {
    try {
      const { providers } = await apiGet<{ providers: ServerConfig }>("/api/config");
      set({ providers, loaded: true, error: undefined });
    } catch (e) {
      set({ loaded: true, error: (e as Error).message });
    }
  },
}));

export const configuredFor = (p: ProviderId, c: ServerConfig) => c[p];

export const CONFIG_HINT: Record<ProviderId, string> = {
  youtube: "Set YOUTUBE_API_KEY on the server to enable YouTube search. Pasted YouTube links play without it.",
  spotify:
    "Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET on the server to enable Spotify search. Without them, paste a Spotify song, album, playlist or artist link: it plays in Spotify's own player and can be saved to your library.",
  soundcloud:
    "Set SOUNDCLOUD_CLIENT_ID and SOUNDCLOUD_CLIENT_SECRET on the server to enable SoundCloud search. Without them, paste a SoundCloud track or playlist link: it plays in SoundCloud's own player.",
  apple: "Set APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_KEY_ID and APPLE_MUSIC_PRIVATE_KEY on the server to enable Apple Music.",
};
