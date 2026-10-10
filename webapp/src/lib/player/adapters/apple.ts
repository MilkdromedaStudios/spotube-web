"use client";

import type { AdapterEvents, LoadOptions, PlaybackAdapter } from "./types";
import { getMusicKit, type MusicKitInstance } from "@/lib/providers/apple";
import type { Track } from "@/lib/types";

// MusicKit.PlaybackStates
const S = { loading: 1, playing: 2, paused: 3, stopped: 4, ended: 5, seeking: 6, waiting: 8, stalled: 9, completed: 10 };

/**
 * Apple MusicKit JS. Subscribers who authorize get full tracks; others hear
 * the previews Apple allows.
 */
export class AppleMusicAdapter implements PlaybackAdapter {
  readonly name = "Apple MusicKit";
  readonly provider = "apple" as const;
  readonly capabilities = { seek: true, volume: true };
  private music: MusicKitInstance | null = null;
  private volume = 1;
  private active = false;

  constructor(private events: AdapterEvents) {}

  private async ensure() {
    if (this.music) return this.music;
    const music = await getMusicKit();
    this.music = music;
    const pos = () => ({
      positionMs: music.currentPlaybackTime * 1000,
      durationMs: music.currentPlaybackDuration * 1000 || undefined,
    });
    music.addEventListener("playbackStateDidChange", () => {
      if (!this.active) return;
      const st = music.playbackState;
      if (st === S.playing) this.events.onState({ status: "playing", ...pos() });
      else if (st === S.paused || st === S.stopped) this.events.onState({ status: "paused", ...pos() });
      else if (st === S.ended || st === S.completed) this.events.onState({ status: "ended", ...pos() });
      else if (st === S.loading || st === S.waiting || st === S.stalled || st === S.seeking)
        this.events.onState({ status: "buffering", ...pos() });
    });
    music.addEventListener("playbackTimeDidChange", () => {
      if (this.active && music.playbackState === S.playing) this.events.onState({ status: "playing", ...pos() });
    });
    music.addEventListener("mediaPlaybackError", (e) => {
      if (this.active)
        this.events.onError({ message: `Apple Music playback error${(e as Error)?.message ? `: ${(e as Error).message}` : ""}.`, fatal: true });
    });
    return music;
  }

  async load(track: Track, opts: LoadOptions) {
    const music = await this.ensure();
    this.active = true;
    music.volume = this.volume;
    await music.setQueue({ song: track.playbackRef ?? track.id, startPlaying: opts.autoplay });
    if (opts.startMs > 0) await music.seekToTime(opts.startMs / 1000);
    if (!opts.autoplay) this.events.onState({ status: "paused", positionMs: opts.startMs, durationMs: track.durationMs });
  }
  async play() {
    this.active = true;
    await this.music?.play();
  }
  pause() {
    this.music?.pause();
  }
  stop() {
    if (this.music && this.active) this.music.pause();
    this.active = false;
  }
  seek(ms: number) {
    void this.music?.seekToTime(ms / 1000);
  }
  setVolume(v: number) {
    this.volume = v;
    if (this.music) this.music.volume = v;
  }
}
