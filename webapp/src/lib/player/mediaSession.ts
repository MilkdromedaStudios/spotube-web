"use client";

import { currentTrack, next, pause, play, previous, seek, seekBy, usePlayer } from "./engine";
import { getSettings, useSettingsStore } from "@/lib/settings";
import { artistNames } from "@/lib/types";

/**
 * A silent, looping audio element in the page itself. Provider players run in
 * cross-origin iframes, so without it the browser routes hardware media keys
 * and lock-screen controls to the iframe instead of our queue.
 */
let keeper: HTMLAudioElement | null = null;

function silentWav(seconds = 1, rate = 8000) {
  const samples = seconds * rate;
  const buf = new ArrayBuffer(44 + samples);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + samples, true);
  w(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  w(36, "data");
  v.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) v.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

function syncKeeper(playing: boolean, provider?: string) {
  const want = playing && getSettings().mediaSession && provider !== "apple";
  if (!want) {
    keeper?.pause();
    return;
  }
  if (!keeper) {
    keeper = new Audio(silentWav());
    keeper.loop = true;
    keeper.volume = 0.01;
  }
  if (keeper.paused) keeper.play().catch(() => {});
}

export function initMediaSession() {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  const ms = navigator.mediaSession;
  const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
    ["play", () => void play()],
    ["pause", () => pause()],
    ["stop", () => pause()],
    ["previoustrack", () => previous()],
    ["nexttrack", () => next()],
    ["seekbackward", (d) => seekBy(-(d.seekOffset ?? 10) * 1000)],
    ["seekforward", (d) => seekBy((d.seekOffset ?? 10) * 1000)],
    ["seekto", (d) => d.seekTime !== undefined && seek(d.seekTime * 1000)],
  ];
  const apply = (enabled: boolean) => {
    for (const [action, h] of handlers) {
      try {
        ms.setActionHandler(action, enabled ? h : null);
      } catch {
        /* unsupported action */
      }
    }
    if (!enabled) {
      ms.metadata = null;
      keeper?.pause();
    }
  };
  apply(getSettings().mediaSession);
  useSettingsStore.subscribe((s, p) => {
    if (s.settings.mediaSession !== p.settings.mediaSession) apply(s.settings.mediaSession);
  });

  let lastKey: string | undefined;
  usePlayer.subscribe((s) => {
    if (!getSettings().mediaSession) return;
    const t = currentTrack(s);
    if (t?.key !== lastKey) {
      lastKey = t?.key;
      ms.metadata = t
        ? new MediaMetadata({
            title: t.title,
            artist: artistNames(t),
            album: t.album?.name ?? "",
            artwork: t.artwork && getSettings().loadArtwork ? [{ src: t.artwork, sizes: "512x512" }] : [],
          })
        : null;
    }
    const playing = s.status === "playing" || s.status === "buffering";
    ms.playbackState = !t ? "none" : playing ? "playing" : "paused";
    syncKeeper(playing, t?.provider);
    if (s.durationMs && s.durationMs > 0 && s.positionMs <= s.durationMs) {
      try {
        ms.setPositionState({ duration: s.durationMs / 1000, position: s.positionMs / 1000, playbackRate: 1 });
      } catch {
        /* ignore invalid states */
      }
    }
  });
}
