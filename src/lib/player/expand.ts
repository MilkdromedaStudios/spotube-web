"use client";

import { loadApi, type YTPlayer } from "./adapters/youtube";
import { loadScript } from "./adapters/types";
import { collectionKind } from "@/lib/collections";
import { resolveLink } from "@/lib/providers";
import { scTrackToTrack, type ScTrack } from "@/lib/providers/mappers/soundcloud";
import { getSettings } from "@/lib/settings";
import type { Track } from "@/lib/types";

/**
 * Lists the songs of a YouTube playlist or SoundCloud set without API keys by
 * asking the provider's official player, which is loaded off-screen and never
 * plays. Spotify's embed has no such call, so Spotify playlists stay one item.
 */
export async function expandCollection(item: Track): Promise<Track[] | null> {
  if (collectionKind(item) !== "playlist") return null;
  if (item.provider === "youtube") return youtubeSongs((item.playbackRef ?? "").replace(/^playlist:/, ""));
  if (item.provider === "soundcloud" && item.playbackRef) return soundcloudSongs(item.playbackRef);
  return null;
}

const MAX_SONGS = 200;
const TIMEOUT_MS = 15000;

function offscreen(): HTMLDivElement {
  const box = document.createElement("div");
  box.setAttribute("aria-hidden", "true");
  box.style.cssText = "position:fixed;left:-10000px;top:0;width:320px;height:180px;overflow:hidden;";
  document.body.appendChild(box);
  return box;
}

async function youtubeSongs(list: string): Promise<Track[]> {
  const YT = await loadApi();
  const box = offscreen();
  const mount = document.createElement("div");
  box.appendChild(mount);
  let player: YTPlayer | null = null;
  let poll: ReturnType<typeof setInterval> | undefined;
  try {
    const ids = await new Promise<string[]>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("YouTube didn't return the playlist's videos.")), TIMEOUT_MS);
      const check = () => {
        const ids = player?.getPlaylist();
        if (!ids?.length) return;
        clearTimeout(timer);
        resolve(ids);
      };
      player = new YT.Player(mount, {
        host: getSettings().youtubePrivacyMode ? "https://www.youtube-nocookie.com" : "https://www.youtube.com",
        width: 320,
        height: 180,
        playerVars: { listType: "playlist", list, autoplay: 0, enablejsapi: 1, origin: window.location.origin },
        events: {
          onReady: () => {
            check();
            poll = setInterval(check, 300);
          },
          onStateChange: check,
          onError: () => {
            clearTimeout(timer);
            reject(new Error("YouTube couldn't open that playlist. It may be private."));
          },
        },
      });
    });
    // Titles and artwork come from YouTube's public oEmbed, one video at a time.
    const songs = await mapLimit(ids.slice(0, MAX_SONGS), 6, async (id) => {
      const r = await resolveLink(`https://www.youtube.com/watch?v=${id}`).catch(() => null);
      return r?.kind === "track" ? r.track : null;
    });
    return songs.filter((t): t is Track => !!t);
  } finally {
    clearInterval(poll);
    try {
      (player as YTPlayer | null)?.destroy();
    } catch {
      /* not ready */
    }
    box.remove();
  }
}

interface ScWidgetLite {
  bind(event: string, cb: () => void): void;
  getSounds(cb: (sounds: Partial<ScTrack>[]) => void): void;
}

async function soundcloudSongs(url: string): Promise<Track[]> {
  await loadScript("https://w.soundcloud.com/player/api.js");
  const box = offscreen();
  const iframe = document.createElement("iframe");
  iframe.title = "SoundCloud playlist reader";
  iframe.width = "320";
  iframe.height = "180";
  iframe.src = `https://w.soundcloud.com/player/?${new URLSearchParams({ url, auto_play: "false", visual: "false" })}`;
  box.appendChild(iframe);
  try {
    const SC = window.SC as unknown as { Widget: ((el: HTMLIFrameElement) => ScWidgetLite) & { Events: Record<string, string> } };
    const w = SC.Widget(iframe);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("SoundCloud didn't load the playlist.")), TIMEOUT_MS);
      w.bind(SC.Widget.Events.READY, () => (clearTimeout(timer), resolve()));
    });
    const read = () => new Promise<Partial<ScTrack>[]>((resolve) => w.getSounds(resolve));
    // The widget fills in song details in batches, so read again until every song has a title.
    let sounds = await read();
    for (let i = 0; i < 10 && sounds.some((s) => !s.title); i++) {
      await new Promise((r) => setTimeout(r, 500));
      sounds = await read();
    }
    return sounds
      .filter((s): s is ScTrack => !!s.id && !!s.title)
      .slice(0, MAX_SONGS)
      .map(scTrackToTrack)
      .filter((t): t is Track => !!t);
  } finally {
    box.remove();
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}
