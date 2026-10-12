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

/** The music service a request to the site's /api is about, for messages listeners read. */
function serviceFor(path: string, params: Record<string, string | number | undefined>): string {
  const target = path === "/api/resolve" ? String(params.url ?? "") : path;
  if (/spotify/i.test(target)) return "Spotify";
  if (/youtu/i.test(target)) return "YouTube";
  if (/soundcloud/i.test(target)) return "SoundCloud";
  if (/apple/i.test(target)) return "Apple Music";
  return path === "/api/config" ? "This site" : "The music service";
}

/** Words that mean nothing to someone who isn't a developer. */
const TECHNICAL = /\b(api|endpoint|parameter|catalogue|metadata|json|http|method|cross-site|musickit|sdk|iframe|token|server|backend)\b|[A-Z]{2,}_[A-Z_]+/i;

/**
 * Turns an error from the site's /api into a sentence a listener understands.
 * The original message still goes to the browser console for whoever runs the site.
 */
function friendlyMessage(service: string, code: string, status: number, message: string): string {
  if (code === "rate_limited" || status === 429) return `${service} is busy right now. Try again in a minute.`;
  if (code === "not_configured") return `${service} isn't set up on this site yet.`;
  if ((code === "bad_request" || code === "not_found" || code === "unauthorized") && message && !TECHNICAL.test(message)) {
    return message;
  }
  if (code === "not_found") return `${service} couldn't find that.`;
  if (code === "bad_request") return "That didn't work. Check the link or search and try again.";
  return `${service} isn't responding right now. Try again in a little while.`;
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
    const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
    const code = err?.code ?? "upstream_error";
    const detail = err?.message ?? (
      body === null && res.status >= 500
        ? `The site backend returned HTTP ${res.status} without JSON. Check the Cloudflare Pages Functions deployment/logs; the request may not have reached the music API.`
        : `Request failed (${res.status}).`
    );
    console.warn(`[Spotube Web] ${path} failed (${res.status} ${code}): ${detail}`);
    throw new ProviderError(friendlyMessage(serviceFor(path, params), code, res.status, detail), code, res.status);
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
  /** Exact public OAuth callback URL sent to Spotify, never a credential. */
  spotifyRedirectUri?: string | null;
  spotifyRedirectError?: string | null;
  spotifyClientId?: string | null;
  providers: ServerConfig;
  load: () => Promise<void>;
}

export const useServerConfig = create<ConfigState>((set) => ({
  loaded: false,
  providers: { youtube: false, spotify: false, spotifyLogin: false, soundcloud: false, apple: false },
  load: async () => {
    try {
      const { providers, spotifyRedirectUri, spotifyRedirectError, spotifyClientId } = await apiGet<{
        providers: ServerConfig;
        spotifyRedirectUri?: string | null;
        spotifyRedirectError?: string | null;
        spotifyClientId?: string | null;
      }>("/api/config");
      set({ providers, spotifyRedirectUri, spotifyRedirectError, spotifyClientId, loaded: true, error: undefined });
    } catch (e) {
      set({ loaded: true, error: (e as Error).message });
    }
  },
}));

export const configuredFor = (p: ProviderId, c: ServerConfig) => c[p];

/** Shown to listeners when a service's search isn't available. Setup steps for the site owner are in the README. */
export const CONFIG_HINT: Record<ProviderId, string> = {
  youtube: "YouTube search isn't available on this site yet. You can still paste a YouTube link to play it.",
  spotify: "Spotify search isn't available right now. You can still paste a Spotify link to play it.",
  soundcloud: "SoundCloud search isn't available on this site yet. You can still paste a SoundCloud link to play it.",
  apple: "Apple Music isn't available on this site yet.",
};
