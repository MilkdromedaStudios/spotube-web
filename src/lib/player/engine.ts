"use client";

import { create } from "zustand";
import { AppleMusicAdapter } from "./adapters/apple";
import { SoundCloudAdapter } from "./adapters/soundcloud";
import { preloadSpotifyEmbed, SpotifyEmbedAdapter, SpotifySdkAdapter } from "./adapters/spotify";
import type { AdapterError, AdapterState, PlaybackAdapter } from "./adapters/types";
import { loadApi as loadYouTubeApi, YouTubeAdapter } from "./adapters/youtube";
import { nextIndex, previousIndex, shuffled } from "./queue";
import { collectionKind } from "@/lib/collections";
import { getDb } from "@/lib/db/db";
import {
  clearResume,
  getResume,
  getTracks,
  learnDuration,
  recordPlay,
  saveResume,
  updateListened,
  upsertTracks,
} from "@/lib/db/library";
import type { PlayerStateRecord, RepeatMode } from "@/lib/db/schema";
import { useSpotifyAuth } from "@/lib/providers/spotify";
import { getSettings } from "@/lib/settings";
import { toast } from "@/lib/toast";
import { PROVIDER_LABELS, type ProviderId, type Track } from "@/lib/types";

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "buffering" | "error";

export interface PlayerState {
  queue: Track[];
  /** Queue order before shuffle was turned on */
  original: Track[] | null;
  index: number;
  status: PlayerStatus;
  positionMs: number;
  durationMs?: number;
  volume: number;
  muted: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
  error?: string;
  notice?: string;
  /** The provider is only playing a short preview (Spotify when the listener isn't signed in). */
  preview?: boolean;
  /** The provider's own player buttons are the controls; the site can't tell if it is playing. */
  providerControls?: boolean;
  /** Name of the official player currently in use */
  engine?: string;
  canSeek: boolean;
  canSetVolume: boolean;
  nowPlayingOpen: boolean;
  queueOpen: boolean;
  restored: boolean;
}

export const usePlayer = create<PlayerState>(() => ({
  queue: [],
  original: null,
  index: -1,
  status: "idle",
  positionMs: 0,
  volume: 0.8,
  muted: false,
  repeat: "off",
  shuffle: false,
  canSeek: true,
  canSetVolume: true,
  nowPlayingOpen: false,
  queueOpen: false,
  restored: false,
}));

const set = (patch: Partial<PlayerState>) => usePlayer.setState(patch);
const get = () => usePlayer.getState();

export const currentTrack = (s: PlayerState = get()) => (s.index >= 0 ? s.queue[s.index] : undefined);

// ------------------------------------------------------------------ adapters

const adapters = new Map<string, PlaybackAdapter>();
let current: PlaybackAdapter | null = null;
/** True once the current track has been handed to an adapter */
let loaded = false;
let loadSeq = 0;

function make(kind: string): PlaybackAdapter {
  let a = adapters.get(kind);
  if (a) return a;
  const events = {
    onState: (s: AdapterState) => a === current && onAdapterState(s),
    onError: (e: AdapterError) => a === current && onAdapterError(e),
  };
  if (kind === "youtube") a = new YouTubeAdapter(events);
  else if (kind === "soundcloud") a = new SoundCloudAdapter(events);
  else if (kind === "spotify-sdk") a = new SpotifySdkAdapter(events);
  else if (kind === "spotify-embed") a = new SpotifyEmbedAdapter(events);
  else a = new AppleMusicAdapter(events);
  adapters.set(kind, a);
  return a;
}

function adapterKind(track: Track): string {
  const provider = track.provider;
  if (provider !== "spotify") return provider;
  // Albums, playlists and artists saved from links always play in the Spotify embed.
  if (collectionKind(track)) return "spotify-embed";
  const auth = useSpotifyAuth.getState();
  const sdk = adapters.get("spotify-sdk") as SpotifySdkAdapter | undefined;
  const useSdk =
    getSettings().spotifyPlayback === "auto" &&
    auth.connected &&
    auth.product === "premium" &&
    auth.scope.includes("streaming") &&
    !sdk?.unavailable;
  return useSdk ? "spotify-sdk" : "spotify-embed";
}

// --------------------------------------------------------- listening stats

let historyId: number | undefined;
let listenedMs = 0;
let lastTick: number | null = null;
let lastResumeSave = 0;
let retries = 0;
let consecutiveErrors = 0;
let pendingStartMs = 0;

function flushListening() {
  if (historyId !== undefined && listenedMs > 0) void updateListened(historyId, listenedMs);
}

function resetListening() {
  flushListening();
  historyId = undefined;
  listenedMs = 0;
  lastTick = null;
}

// ---------------------------------------------------------- adapter events

function onAdapterState(s: AdapterState) {
  const track = currentTrack();
  if (!track) return;
  const now = Date.now();
  if (s.status === "playing") {
    if (lastTick !== null) listenedMs += Math.min(5000, now - lastTick);
    lastTick = now;
    retries = 0;
    consecutiveErrors = 0;
    if (historyId === undefined && getSettings().recordHistory) {
      historyId = -1; // claim synchronously so we only record once
      void recordPlay(track).then((id) => (historyId = id));
    }
    if (listenedMs > 0 && Math.floor(listenedMs / 15000) !== Math.floor((listenedMs - 600) / 15000)) flushListening();
  } else lastTick = null;

  const durationMs = s.durationMs && s.durationMs > 0 ? s.durationMs : (get().durationMs ?? track.durationMs);
  // In a collection the reported duration is the current song's, not the item's.
  const collection = !!collectionKind(track);
  if (!collection && !s.preview && s.durationMs && s.durationMs > 1000 && (!track.durationMs || Math.abs(track.durationMs - s.durationMs) > 2000))
    void learnDuration(track.key, s.durationMs);

  if (s.status === "ended") {
    flushListening();
    void clearResume(track.key);
    set({ positionMs: durationMs ?? 0, durationMs });
    handleEnded();
    return;
  }

  const positionMs = s.positionMs ?? get().positionMs;
  set({
    status: s.status === "loading" ? "loading" : s.status,
    positionMs,
    durationMs,
    preview: !!s.preview,
    providerControls: !!s.providerControls,
    error: undefined,
    ...(s.status === "playing" ? { notice: undefined } : {}),
  });

  if (
    s.status === "playing" &&
    !collection &&
    getSettings().resumeLongTracks &&
    (durationMs ?? 0) > 10 * 60_000 &&
    now - lastResumeSave > 10_000
  ) {
    lastResumeSave = now;
    void saveResume(track.key, positionMs);
  }
}

function onAdapterError(e: AdapterError) {
  const track = currentTrack();
  if (e.notice) {
    // Shown in the player bar; a toast on top of that would only repeat it.
    set({ notice: e.message, status: "paused" });
    return;
  }
  if (!e.fatal && retries < 1 && track) {
    retries++;
    const seq = loadSeq;
    set({ status: "buffering" });
    setTimeout(() => seq === loadSeq && void select(get().index, { autoplay: true, startMs: get().positionMs }), 2000);
    return;
  }
  // Spotify SDK isn't usable for this account: fall back to the embed and retry once.
  if (current instanceof SpotifySdkAdapter && current.unavailable && track) {
    console.warn(`[Spotube Web] ${current.unavailable}`);
    toast.info("Playing with Spotify's regular player instead.");
    void select(get().index, { autoplay: true, startMs: 0 });
    return;
  }
  consecutiveErrors++;
  set({ status: "error", error: e.message });
  toast.error(track ? `Can't play "${track.title}": ${e.message}` : e.message);
  const s = get();
  if (getSettings().skipOnError && consecutiveErrors < 3 && nextIndex(s.index, s.queue.length, s.repeat) !== null) {
    const seq = loadSeq;
    setTimeout(() => seq === loadSeq && next(true), 1500);
  }
}

function handleEnded() {
  const s = get();
  if (s.repeat === "one") {
    current?.seek(0);
    void current?.play();
    return;
  }
  if (!getSettings().autoplayNext) {
    set({ status: "paused" });
    return;
  }
  const i = nextIndex(s.index, s.queue.length, s.repeat);
  if (i === null) {
    set({ status: "paused" });
    return;
  }
  void select(i, { autoplay: true });
}

// ------------------------------------------------------------------ loading

async function select(index: number, opts: { autoplay: boolean; startMs?: number }) {
  const s = get();
  const track = s.queue[index];
  if (!track) return;
  const seq = ++loadSeq;
  resetListening();
  retries = opts.startMs !== undefined ? retries : 0;

  let startMs = opts.startMs ?? 0;
  if (opts.startMs === undefined && getSettings().resumeLongTracks && (track.durationMs ?? 0) > 10 * 60_000) {
    const r = await getResume(track.key).catch(() => undefined);
    if (r && r.positionMs > 30_000 && r.positionMs < (track.durationMs ?? 0) - 15_000) startMs = r.positionMs;
  }

  if (!getSettings().enabledProviders[track.provider]) {
    current?.stop();
    loaded = false;
    set({ index, status: "error", error: `${PROVIDER_LABELS[track.provider]} is turned off in Settings → Music providers.` });
    return;
  }

  const kind = adapterKind(track);
  const adapter = make(kind);
  for (const [k, a] of adapters) if (k !== kind) a.stop();
  current = adapter;
  loaded = true;
  set({
    index,
    status: opts.autoplay ? "loading" : "paused",
    positionMs: startMs,
    durationMs: track.durationMs,
    error: undefined,
    notice: undefined,
    preview: false,
    providerControls: false,
    engine: adapter.name,
    canSeek: adapter.capabilities.seek,
    canSetVolume: adapter.capabilities.volume,
  });
  adapter.setVolume(effectiveVolume());
  try {
    await adapter.load(track, { autoplay: opts.autoplay, startMs });
  } catch (e) {
    if (seq !== loadSeq) return;
    console.warn(`[Spotube Web] ${PROVIDER_LABELS[track.provider]} player failed to load:`, e);
    onAdapterError({
      message: `${PROVIDER_LABELS[track.provider]} didn't load. Check your connection, or turn off ad blockers for this site, and try again.`,
      fatal: true,
    });
  }
}

const effectiveVolume = () => (get().muted ? 0 : get().volume);

// ------------------------------------------------------------------ actions

/** Replaces the queue and starts playing `startIndex`. */
export async function playTracks(tracks: Track[], startIndex = 0, opts: { shuffle?: boolean } = {}) {
  if (!tracks.length) return;
  const shuffle = opts.shuffle ?? get().shuffle;
  const start = tracks[Math.max(0, Math.min(startIndex, tracks.length - 1))];
  const queue = shuffle ? shuffled(tracks, opts.shuffle && startIndex === 0 ? undefined : start) : tracks.slice();
  set({ queue, original: shuffle ? tracks.slice() : null, shuffle });
  await select(shuffle ? 0 : tracks.indexOf(start), { autoplay: true });
  void upsertTracks(queue);
}

export async function playTrack(track: Track) {
  const s = get();
  const existing = s.queue.findIndex((t) => t.key === track.key);
  if (existing >= 0) return select(existing, { autoplay: true });
  const queue = [...s.queue.slice(0, s.index + 1), track, ...s.queue.slice(s.index + 1)];
  set({ queue, original: s.original ? [...s.original, track] : null });
  void upsertTracks([track]);
  return select(s.index + 1, { autoplay: true });
}

export function addToQueue(tracks: Track[]) {
  const s = get();
  const keys = new Set(s.queue.map((t) => t.key));
  const fresh = tracks.filter((t) => !keys.has(t.key));
  if (!fresh.length) return 0;
  set({ queue: [...s.queue, ...fresh], original: s.original ? [...s.original, ...fresh] : null });
  void upsertTracks(fresh);
  if (s.index < 0) set({ index: 0, status: "paused" });
  return fresh.length;
}

export function playNext(track: Track) {
  const s = get();
  if (currentTrack(s)?.key === track.key) return;
  const without = s.queue.filter((t) => t.key !== track.key);
  const curIdx = s.index >= 0 ? without.findIndex((t) => t.key === s.queue[s.index]?.key) : -1;
  const queue = [...without.slice(0, curIdx + 1), track, ...without.slice(curIdx + 1)];
  set({
    queue,
    index: s.index < 0 ? 0 : curIdx,
    original: s.original ? [...s.original.filter((t) => t.key !== track.key), track] : null,
    ...(s.index < 0 ? { status: "paused" as const } : {}),
  });
  void upsertTracks([track]);
}

export function removeFromQueue(i: number) {
  const s = get();
  if (i < 0 || i >= s.queue.length) return;
  const removed = s.queue[i];
  const queue = s.queue.filter((_, j) => j !== i);
  const original = s.original?.filter((t) => t.key !== removed.key) ?? null;
  if (i === s.index) {
    current?.stop();
    loaded = false;
    if (!queue.length) return clearQueue();
    const index = Math.min(i, queue.length - 1);
    set({ queue, original, index });
    if (s.status === "playing" || s.status === "loading" || s.status === "buffering") void select(index, { autoplay: true });
    else set({ status: "paused", positionMs: 0 });
    return;
  }
  set({ queue, original, index: i < s.index ? s.index - 1 : s.index });
}

export function moveInQueue(from: number, to: number) {
  const s = get();
  if (from === to || from < 0 || to < 0 || from >= s.queue.length || to >= s.queue.length) return;
  const queue = s.queue.slice();
  const [item] = queue.splice(from, 1);
  queue.splice(to, 0, item);
  let index = s.index;
  if (from === s.index) index = to;
  else if (from < s.index && to >= s.index) index--;
  else if (from > s.index && to <= s.index) index++;
  set({ queue, index });
}

export function clearQueue() {
  current?.stop();
  loaded = false;
  resetListening();
  set({ queue: [], original: null, index: -1, status: "idle", positionMs: 0, durationMs: undefined, error: undefined, notice: undefined });
}

export async function play() {
  const s = get();
  if (s.index < 0) return;
  if (!loaded || s.status === "error") return select(s.index, { autoplay: true, startMs: s.status === "error" ? 0 : pendingStartMs || s.positionMs });
  set({ notice: undefined });
  await current?.play();
}

export function pause() {
  current?.pause();
  flushListening();
}

export function togglePlay() {
  const s = get();
  if (s.status === "playing" || s.status === "buffering" || s.status === "loading") pause();
  else void play();
}

export function next(auto = false) {
  const s = get();
  if (!s.queue.length) return;
  const i = nextIndex(s.index, s.queue.length, s.repeat === "one" && !auto ? "all" : s.repeat);
  if (i === null) {
    if (!auto) void select(0, { autoplay: false });
    return;
  }
  void select(i, { autoplay: true });
}

export function previous() {
  const s = get();
  if (!s.queue.length) return;
  const p = previousIndex(s.index, s.queue.length, s.repeat, s.positionMs);
  if (p === "restart") return seek(0);
  void select(p, { autoplay: true });
}

export function seek(ms: number) {
  const s = get();
  const clamped = Math.max(0, Math.min(ms, s.durationMs ?? ms));
  set({ positionMs: clamped });
  if (!loaded) {
    pendingStartMs = clamped;
    return;
  }
  current?.seek(clamped);
}

export function seekBy(deltaMs: number) {
  seek(get().positionMs + deltaMs);
}

export function setVolume(v: number) {
  const volume = Math.max(0, Math.min(1, v));
  set({ volume, muted: volume === 0 ? get().muted : false });
  for (const a of adapters.values()) a.setVolume(effectiveVolume());
}

export function toggleMute() {
  set({ muted: !get().muted });
  for (const a of adapters.values()) a.setVolume(effectiveVolume());
}

export function cycleRepeat() {
  const order: RepeatMode[] = ["off", "all", "one"];
  set({ repeat: order[(order.indexOf(get().repeat) + 1) % order.length] });
}

export function toggleShuffle() {
  const s = get();
  const cur = currentTrack(s);
  if (!s.shuffle) {
    const queue = shuffled(s.queue, cur);
    set({ shuffle: true, original: s.queue, queue, index: cur ? 0 : -1 });
  } else {
    const original = s.original ?? s.queue;
    // Keep tracks that were added while shuffled.
    const keys = new Set(original.map((t) => t.key));
    const queue = [...original, ...s.queue.filter((t) => !keys.has(t.key))];
    set({ shuffle: false, original: null, queue, index: cur ? queue.findIndex((t) => t.key === cur.key) : -1 });
  }
}

export const setNowPlayingOpen = (open: boolean) => set({ nowPlayingOpen: open });
export const setQueueOpen = (open: boolean) => set({ queueOpen: open });

// -------------------------------------------------------------- persistence

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastPositionSave = 0;

function snapshot(s: PlayerState): PlayerStateRecord {
  return {
    id: "current",
    queueKeys: s.queue.map((t) => t.key),
    originalKeys: s.original?.map((t) => t.key) ?? null,
    index: s.index,
    positionMs: Math.round(s.positionMs),
    volume: s.volume,
    muted: s.muted,
    repeat: s.repeat,
    shuffle: s.shuffle,
    updatedAt: Date.now(),
  };
}

function persist(immediate: boolean) {
  if (!get().restored) return;
  if (saveTimer) clearTimeout(saveTimer);
  const run = () => {
    saveTimer = null;
    lastPositionSave = Date.now();
    getDb()
      .player.put(snapshot(get()))
      .catch(() => {
        /* storage failures are surfaced by the library writes */
      });
  };
  if (immediate) run();
  else saveTimer = setTimeout(run, 400);
}

/** Restores the previous session's queue and settings, then keeps them saved. */
export async function initPlayer() {
  if (get().restored) return;
  try {
    const rec = await getDb().player.get("current");
    if (rec) {
      const queue = await getTracks(rec.queueKeys);
      const original = rec.originalKeys ? await getTracks(rec.originalKeys) : null;
      const curKey = rec.queueKeys[rec.index];
      const index = queue.findIndex((t) => t.key === curKey);
      pendingStartMs = rec.positionMs;
      set({
        queue,
        original,
        index: index >= 0 ? index : queue.length ? 0 : -1,
        positionMs: index >= 0 ? rec.positionMs : 0,
        durationMs: queue[index]?.durationMs,
        volume: rec.volume,
        muted: rec.muted,
        repeat: rec.repeat,
        shuffle: rec.shuffle,
        status: queue.length ? "paused" : "idle",
      });
    }
  } catch {
    /* start fresh */
  }
  set({ restored: true });

  usePlayer.subscribe((s, prev) => {
    const structural =
      s.queue !== prev.queue ||
      s.index !== prev.index ||
      s.volume !== prev.volume ||
      s.muted !== prev.muted ||
      s.repeat !== prev.repeat ||
      s.shuffle !== prev.shuffle ||
      s.status !== prev.status;
    if (structural) persist(s.queue !== prev.queue || s.index !== prev.index);
    else if (s.positionMs !== prev.positionMs && Date.now() - lastPositionSave > 5000) persist(false);
    if (s.index !== prev.index) pendingStartMs = 0;
  });
  window.addEventListener("pagehide", () => {
    flushListening();
    persist(true);
  });
  // Wait until the page has settled so preloading doesn't slow down the first screen.
  if ("requestIdleCallback" in window) window.requestIdleCallback(preloadPlayers, { timeout: 3000 });
  else setTimeout(preloadPlayers, 1500);
}

/**
 * Reloads Spotify's player, for example after the listener signed in to Spotify in another tab,
 * so it plays full songs instead of previews. The current Spotify song continues where it was.
 */
export function refreshSpotifyPlayer() {
  (adapters.get("spotify-embed") as SpotifyEmbedAdapter | undefined)?.reset();
  const s = get();
  if (!loaded || !(current instanceof SpotifyEmbedAdapter) || s.queue[s.index]?.provider !== "spotify") return;
  const wasPlaying = s.status === "playing" || s.status === "loading" || s.status === "buffering";
  void select(s.index, { autoplay: wasPlaying, startMs: s.positionMs });
}

/**
 * Loads the official players in the background so songs start sooner, and gets the restored
 * song's player ready so pressing Play starts it right away.
 */
function preloadPlayers() {
  const settings = getSettings();
  if (!settings.preloadPlayers) return;
  if (settings.enabledProviders.spotify) preloadSpotifyEmbed();
  if (settings.enabledProviders.youtube) loadYouTubeApi().catch(() => {});
  const s = get();
  const track = s.queue[s.index];
  if (!loaded && track && (track.provider === "spotify" || track.provider === "youtube") && settings.enabledProviders[track.provider]) {
    void select(s.index, { autoplay: false, startMs: pendingStartMs });
  }
}

/** Jumps to a track that is already in the queue. */
export function playQueueIndex(i: number) {
  if (i >= 0 && i < get().queue.length) void select(i, { autoplay: true });
}
