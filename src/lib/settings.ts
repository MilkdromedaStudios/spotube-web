"use client";

import { create } from "zustand";
import { getDb } from "@/lib/db/db";
import { write } from "@/lib/db/library";
import type { ProviderId } from "@/lib/types";

export const ACCENTS = {
  slate: { label: "Slate", color: "#94a3b8" },
  green: { label: "Green", color: "#1ed760" },
  blue: { label: "Blue", color: "#3b82f6" },
  violet: { label: "Violet", color: "#8b5cf6" },
  rose: { label: "Rose", color: "#f43f5e" },
  orange: { label: "Orange", color: "#f97316" },
  yellow: { label: "Yellow", color: "#eab308" },
  teal: { label: "Teal", color: "#14b8a6" },
} as const;

export type Accent = keyof typeof ACCENTS;

export interface Settings {
  // Appearance
  theme: "dark" | "light" | "system";
  accent: Accent;
  compactLists: boolean;
  reduceMotion: boolean;
  // Providers
  enabledProviders: Record<ProviderId, boolean>;
  preferredProvider: ProviderId;
  appleStorefront: string;
  spotifyPlayback: "auto" | "embed";
  // Playback
  autoplayNext: boolean;
  resumeLongTracks: boolean;
  skipOnError: boolean;
  mediaSession: boolean;
  // Privacy
  youtubePrivacyMode: boolean;
  loadArtwork: boolean;
  recordHistory: boolean;
  showAdNotices: boolean;
  requestPersistentStorage: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  accent: "green",
  compactLists: false,
  reduceMotion: false,
  enabledProviders: { youtube: true, spotify: true, soundcloud: true, apple: true },
  preferredProvider: "youtube",
  appleStorefront: "us",
  spotifyPlayback: "auto",
  autoplayNext: true,
  resumeLongTracks: true,
  skipOnError: true,
  mediaSession: true,
  youtubePrivacyMode: true,
  loadArtwork: true,
  recordHistory: true,
  showAdNotices: true,
  requestPersistentStorage: false,
};

interface SettingsState {
  loaded: boolean;
  settings: Settings;
  load: () => Promise<void>;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>;
  replaceAll: (s: Partial<Settings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  loaded: false,
  settings: DEFAULT_SETTINGS,
  load: async () => {
    try {
      const rows = await getDb().settings.toArray();
      const stored = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Partial<Settings>;
      set({ settings: mergeSettings(stored), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  set: async (key, value) => {
    set({ settings: { ...get().settings, [key]: value } });
    await write(() => getDb().settings.put({ key, value }));
  },
  replaceAll: async (s) => {
    const merged = mergeSettings(s);
    set({ settings: merged });
    await write(() =>
      getDb().settings.bulkPut(Object.entries(merged).map(([key, value]) => ({ key, value }))),
    );
  },
}));

export function mergeSettings(stored: Partial<Settings>): Settings {
  const out = { ...DEFAULT_SETTINGS } as Settings;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const v = stored[key];
    if (v === undefined || v === null) continue;
    if (typeof v !== typeof DEFAULT_SETTINGS[key]) continue;
    (out as unknown as Record<string, unknown>)[key] =
      key === "enabledProviders" ? { ...DEFAULT_SETTINGS.enabledProviders, ...(v as object) } : v;
  }
  if (!(out.accent in ACCENTS)) out.accent = DEFAULT_SETTINGS.accent;
  return out;
}

export function useSettings(): Settings {
  return useSettingsStore((s) => s.settings);
}

export const getSettings = () => useSettingsStore.getState().settings;
export const setSetting = <K extends keyof Settings>(key: K, value: Settings[K]) =>
  useSettingsStore.getState().set(key, value);
