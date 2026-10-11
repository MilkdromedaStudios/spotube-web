"use client";

import { hostElement, loadScript, type AdapterEvents, type LoadOptions, type PlaybackAdapter } from "./types";
import { collectionKind } from "@/lib/collections";
import type { Track } from "@/lib/types";

/* Minimal SoundCloud Widget API typings */
interface SCWidget {
  bind(event: string, cb: (e?: { currentPosition?: number }) => void): void;
  unbind(event: string): void;
  load(url: string, opts: Record<string, unknown>): void;
  play(): void;
  pause(): void;
  seekTo(ms: number): void;
  setVolume(v: number): void;
  getDuration(cb: (ms: number) => void): void;
  getPosition(cb: (ms: number) => void): void;
  getSounds(cb: (sounds: unknown[]) => void): void;
  getCurrentSoundIndex(cb: (index: number) => void): void;
}
declare global {
  interface Window {
    SC?: {
      Widget: ((el: HTMLIFrameElement) => SCWidget) & { Events: Record<string, string> };
    };
  }
}

const WIDGET_OPTIONS = {
  visual: false,
  show_artwork: true,
  show_comments: false,
  show_reposts: false,
  hide_related: true,
  sharing: false,
  buying: false,
  download: false,
  show_user: true,
  single_active: true,
};

const widgetSrc = (url: string, autoplay: boolean) => {
  const params = new URLSearchParams({ url, auto_play: String(autoplay) });
  for (const [k, v] of Object.entries(WIDGET_OPTIONS)) params.set(k, String(v));
  return `https://w.soundcloud.com/player/?${params}`;
};

/** Plays through SoundCloud's official embedded Widget API. */
export class SoundCloudAdapter implements PlaybackAdapter {
  readonly name = "SoundCloud widget";
  readonly provider = "soundcloud" as const;
  readonly capabilities = { seek: true, volume: true };
  private widget: SCWidget | null = null;
  private ready: Promise<void> | null = null;
  private duration = 0;
  private volume = 100;
  private pendingSeek = 0;
  private loadTimer: ReturnType<typeof setTimeout> | null = null;
  /** A whole set plays in the taller widget, which lists its songs and moves through them itself. */
  private collection = false;

  constructor(private events: AdapterEvents) {}

  private finished() {
    const ended = () => this.events.onState({ status: "ended", positionMs: this.duration, durationMs: this.duration });
    if (!this.collection || !this.widget) return ended();
    const w = this.widget;
    // Only the last song of a set ends the item; the widget plays the others in order.
    w.getCurrentSoundIndex((i) => w.getSounds((sounds) => i >= sounds.length - 1 && ended()));
  }

  private async ensureWidget(url: string, autoplay: boolean): Promise<boolean> {
    if (this.widget) return false;
    await loadScript("https://w.soundcloud.com/player/api.js");
    const container = hostElement("soundcloud");
    container.innerHTML = "";
    const iframe = document.createElement("iframe");
    iframe.title = "SoundCloud player";
    iframe.allow = "autoplay; encrypted-media";
    iframe.width = "100%";
    iframe.height = this.collection ? "400" : "166";
    iframe.style.border = "0";
    iframe.src = widgetSrc(url, autoplay);
    container.appendChild(iframe);
    const SC = window.SC!;
    const w = SC.Widget(iframe);
    this.widget = w;
    const E = SC.Widget.Events;
    this.ready = new Promise((resolve) => w.bind(E.READY, () => resolve()));
    w.bind(E.PLAY, () => {
      this.clearLoadTimer();
      w.getDuration((d) => {
        this.duration = d;
        w.getPosition((p) => this.events.onState({ status: "playing", positionMs: p, durationMs: d }));
      });
    });
    w.bind(E.PAUSE, () => w.getPosition((p) => this.events.onState({ status: "paused", positionMs: p, durationMs: this.duration })));
    w.bind(E.FINISH, () => this.finished());
    w.bind(E.PLAY_PROGRESS, (e) =>
      this.events.onState({ status: "playing", positionMs: e?.currentPosition ?? 0, durationMs: this.duration || undefined }),
    );
    w.bind(E.ERROR, () => this.events.onError({ message: "SoundCloud couldn't play this track.", fatal: true }));
    await this.ready;
    this.afterLoad(autoplay);
    return true;
  }

  private afterLoad(autoplay: boolean) {
    const w = this.widget!;
    w.setVolume(this.volume);
    w.getDuration((d) => {
      this.duration = d;
      if (this.pendingSeek) w.seekTo(this.pendingSeek);
      if (!autoplay) this.events.onState({ status: "paused", positionMs: this.pendingSeek, durationMs: d });
      if (!d) this.events.onError({ message: "SoundCloud couldn't load this track.", fatal: true });
    });
  }

  private clearLoadTimer() {
    if (this.loadTimer) clearTimeout(this.loadTimer);
    this.loadTimer = null;
  }

  async load(track: Track, opts: LoadOptions) {
    const url = track.playbackRef ?? track.url ?? `https://api.soundcloud.com/tracks/${track.id}`;
    const collection = !!collectionKind(track);
    if (this.widget && collection !== this.collection) {
      // Switch between the compact and the tall widget.
      this.clearLoadTimer();
      this.widget = null;
    }
    this.collection = collection;
    this.pendingSeek = opts.startMs;
    this.duration = 0;
    if (await this.ensureWidget(url, opts.autoplay)) return;
    await this.ready;
    this.ready = new Promise((resolve) => {
      this.widget!.load(url, {
        ...WIDGET_OPTIONS,
        auto_play: opts.autoplay,
        callback: () => {
          this.afterLoad(opts.autoplay);
          resolve();
        },
      });
    });
    this.clearLoadTimer();
    this.loadTimer = setTimeout(
      () => this.events.onError({ message: "SoundCloud is taking too long to respond.", fatal: false }),
      20000,
    );
    await this.ready;
    this.clearLoadTimer();
  }

  play() {
    this.widget?.play();
  }
  pause() {
    this.widget?.pause();
  }
  stop() {
    this.clearLoadTimer();
    this.widget?.pause();
  }
  seek(ms: number) {
    this.widget?.seekTo(ms);
  }
  setVolume(v: number) {
    this.volume = Math.round(v * 100);
    this.widget?.setVolume(this.volume);
  }
}
