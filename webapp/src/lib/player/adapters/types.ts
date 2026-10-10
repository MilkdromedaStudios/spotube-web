import type { ProviderId, Track } from "@/lib/types";

export type AdapterStatus = "loading" | "playing" | "paused" | "buffering" | "ended";

export interface AdapterState {
  status: AdapterStatus;
  positionMs?: number;
  durationMs?: number;
}

export interface AdapterError {
  message: string;
  /** Fatal errors mean this track can't be played here; non-fatal ones may succeed on retry. */
  fatal: boolean;
  /** Informational notice that needs the user (e.g. press play inside the provider's player) */
  notice?: boolean;
}

export interface AdapterEvents {
  onState(state: AdapterState): void;
  onError(error: AdapterError): void;
}

export interface LoadOptions {
  autoplay: boolean;
  startMs: number;
}

/**
 * Uniform playback interface over each provider's official player.
 * The engine only talks to providers through this.
 */
export interface PlaybackAdapter {
  readonly name: string;
  readonly provider: ProviderId;
  readonly capabilities: { seek: boolean; volume: boolean };
  load(track: Track, opts: LoadOptions): Promise<void>;
  play(): Promise<void> | void;
  pause(): void;
  stop(): void;
  seek(ms: number): void;
  setVolume(volume: number): void;
}

export const HOST_IDS: Record<ProviderId, string> = {
  youtube: "media-stage-youtube",
  spotify: "media-stage-spotify",
  soundcloud: "media-stage-soundcloud",
  apple: "media-stage-apple",
};

export function hostElement(provider: ProviderId): HTMLElement {
  const el = document.getElementById(HOST_IDS[provider]);
  if (!el) throw new Error("Player area is not mounted");
  return el;
}

const scripts = new Map<string, Promise<void>>();

export function loadScript(src: string, timeoutMs = 20000): Promise<void> {
  const existing = scripts.get(src);
  if (existing) return existing;
  const p = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    const timer = setTimeout(() => reject(new Error(`Timed out loading ${new URL(src).host}`)), timeoutMs);
    s.onload = () => (clearTimeout(timer), resolve());
    s.onerror = () => (clearTimeout(timer), reject(new Error(`Couldn't load ${new URL(src).host}. A content blocker or network issue may be preventing it.`)));
    document.head.appendChild(s);
  });
  scripts.set(src, p);
  p.catch(() => scripts.delete(src));
  return p;
}
