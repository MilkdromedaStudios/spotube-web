"use client";

import { hostElement, loadScript, type AdapterEvents, type LoadOptions, type PlaybackAdapter } from "./types";
import { collectionKind } from "@/lib/collections";
import { getSettings } from "@/lib/settings";
import type { Track } from "@/lib/types";

/* Minimal YouTube IFrame Player API typings */
export interface YTPlayer {
  loadVideoById(o: { videoId: string; startSeconds?: number }): void;
  cueVideoById(o: { videoId: string; startSeconds?: number }): void;
  loadPlaylist(o: { list: string; listType: "playlist"; index?: number; startSeconds?: number }): void;
  cuePlaylist(o: { list: string; listType: "playlist"; index?: number; startSeconds?: number }): void;
  getPlaylist(): string[] | null;
  getPlaylistIndex(): number;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(v: number): void;
  unMute(): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
}
interface YTNamespace {
  Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiReady: Promise<YTNamespace> | null = null;
export function loadApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiReady) return apiReady;
  apiReady = new Promise<YTNamespace>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT!);
    };
    loadScript("https://www.youtube.com/iframe_api").catch(reject);
  });
  apiReady.catch(() => (apiReady = null));
  return apiReady;
}

const ERRORS: Record<number, { message: string; fatal: boolean }> = {
  2: { message: "This YouTube video can't be found.", fatal: true },
  5: { message: "YouTube had trouble playing this video.", fatal: false },
  100: { message: "This YouTube video was removed or is private.", fatal: true },
  101: { message: "This video can only be played on YouTube.", fatal: true },
  150: { message: "This video can only be played on YouTube.", fatal: true },
  153: { message: "YouTube wouldn't play this video here.", fatal: true },
};

/** Plays through the official YouTube IFrame Player (optionally youtube-nocookie.com). */
export class YouTubeAdapter implements PlaybackAdapter {
  readonly name = "YouTube player";
  readonly provider = "youtube" as const;
  readonly capabilities = { seek: true, volume: true };
  private player: YTPlayer | null = null;
  private ready: Promise<void> | null = null;
  private host: string | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private volume = 100;
  /** Set while a whole playlist plays in the player, which moves through its videos itself. */
  private list: string | null = null;

  constructor(private events: AdapterEvents) {}

  private async ensurePlayer(videoId: string | null, opts: LoadOptions): Promise<boolean> {
    const host = getSettings().youtubePrivacyMode ? "https://www.youtube-nocookie.com" : "https://www.youtube.com";
    if (this.player && this.host === host) return false;
    this.destroy();
    const YT = await loadApi();
    const container = hostElement("youtube");
    container.innerHTML = "";
    const mount = document.createElement("div");
    container.appendChild(mount);
    this.host = host;
    this.ready = new Promise<void>((resolve) => {
      this.player = new YT.Player(mount, {
        host,
        ...(videoId && { videoId }),
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: opts.autoplay ? 1 : 0,
          start: Math.floor(opts.startMs / 1000),
          ...(this.list && { listType: "playlist", list: this.list }),
          playsinline: 1,
          rel: 0,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            this.player?.setVolume(this.volume);
            resolve();
          },
          onStateChange: (e: { data: number }) => this.handleState(e.data),
          onError: (e: { data: number }) => {
            this.stopPolling();
            this.events.onError(ERRORS[e.data] ?? { message: "YouTube couldn't play this video.", fatal: true });
          },
        },
      });
    });
    await this.ready;
    return true;
  }

  private handleState(state: number) {
    const p = this.player;
    if (!p) return;
    const pos = () => ({ positionMs: p.getCurrentTime() * 1000, durationMs: p.getDuration() * 1000 || undefined });
    switch (state) {
      case 1:
        this.events.onState({ status: "playing", ...pos() });
        this.startPolling();
        break;
      case 2:
        this.stopPolling();
        this.events.onState({ status: "paused", ...pos() });
        break;
      case 3:
        this.events.onState({ status: "buffering", ...pos() });
        break;
      case 0: {
        this.stopPolling();
        // In a playlist only the last video ends the item; the player moves on to the next one itself.
        const last = (p.getPlaylist()?.length ?? 0) - 1;
        if (this.list && p.getPlaylistIndex() < last) break;
        this.events.onState({ status: "ended", ...pos() });
        break;
      }
      case 5:
        this.events.onState({ status: "paused", ...pos() });
        break;
    }
  }

  private startPolling() {
    this.stopPolling();
    this.poll = setInterval(() => {
      const p = this.player;
      if (!p) return;
      this.events.onState({ status: "playing", positionMs: p.getCurrentTime() * 1000, durationMs: p.getDuration() * 1000 || undefined });
    }, 500);
  }

  private stopPolling() {
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
  }

  async load(track: Track, opts: LoadOptions) {
    const ref = track.playbackRef ?? track.id;
    this.list = collectionKind(track) ? ref.replace(/^playlist:/, "") : null;
    const videoId = this.list ? null : ref;
    const created = await this.ensurePlayer(videoId, opts);
    if (created) {
      if (!opts.autoplay) this.events.onState({ status: "paused", positionMs: opts.startMs });
      return; // initial video or playlist was passed to the constructor
    }
    await this.ready;
    if (this.list) {
      const list = { list: this.list, listType: "playlist" as const, index: 0, startSeconds: Math.floor(opts.startMs / 1000) };
      if (opts.autoplay) this.player!.loadPlaylist(list);
      else {
        this.player!.cuePlaylist(list);
        this.events.onState({ status: "paused", positionMs: opts.startMs });
      }
      return;
    }
    const args = { videoId: videoId!, startSeconds: Math.floor(opts.startMs / 1000) };
    if (opts.autoplay) this.player!.loadVideoById(args);
    else {
      this.player!.cueVideoById(args);
      this.events.onState({ status: "paused", positionMs: opts.startMs });
    }
  }

  play() {
    this.player?.playVideo();
  }
  pause() {
    this.player?.pauseVideo();
  }
  stop() {
    this.stopPolling();
    try {
      this.player?.stopVideo();
    } catch {
      /* not ready */
    }
  }
  seek(ms: number) {
    this.player?.seekTo(ms / 1000, true);
  }
  setVolume(v: number) {
    this.volume = Math.round(v * 100);
    try {
      this.player?.setVolume(this.volume);
      if (this.volume > 0) this.player?.unMute();
    } catch {
      /* not ready */
    }
  }
  destroy() {
    this.stopPolling();
    try {
      this.player?.destroy();
    } catch {
      /* ignore */
    }
    this.player = null;
    this.ready = null;
  }
}
