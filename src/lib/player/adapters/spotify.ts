"use client";

import { hostElement, loadScript, type AdapterEvents, type LoadOptions, type PlaybackAdapter } from "./types";
import { collectionKind } from "@/lib/collections";
import { getUserToken } from "@/lib/providers/spotify";
import type { Track } from "@/lib/types";

const uriFor = (t: Track) => t.playbackRef ?? `spotify:track:${t.id}`;

/* ---------------------------------------------------------------- Embed */

interface EmbedController {
  loadUri(uri: string): void;
  play(): void;
  pause(): void;
  resume(): void;
  seek(seconds: number): void;
  addListener(event: string, cb: (e: { data: Record<string, unknown> }) => void): void;
  destroy(): void;
}
interface EmbedApi {
  createController(el: HTMLElement, opts: Record<string, unknown>, cb: (c: EmbedController) => void): void;
}
declare global {
  interface Window {
    onSpotifyIframeApiReady?: (api: EmbedApi) => void;
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: { Player: new (opts: Record<string, unknown>) => SdkPlayer };
  }
}

const EMBED_API_URL = "https://open.spotify.com/embed/iframe-api/v1";
/** Spotify hands over its iFrame API once per page; keep it even if it arrives after a timeout. */
let embedApi: EmbedApi | null = null;
let embedApiArrival: Promise<EmbedApi> | null = null;

function loadEmbedApi(timeoutMs = 8000): Promise<EmbedApi> {
  if (embedApi) return Promise.resolve(embedApi);
  embedApiArrival ??= new Promise<EmbedApi>((resolve) => {
    window.onSpotifyIframeApiReady = (api) => {
      embedApi = api;
      resolve(api);
    };
  });
  const arrival = embedApiArrival;
  return new Promise<EmbedApi>((resolve, reject) => {
    // Script load can succeed even when an extension blocks Spotify's readiness
    // callback; reject instead of leaving the player on "Loading" forever.
    const timeout = setTimeout(() => reject(new Error("Spotify embed did not initialize. Switching to the standard player.")), timeoutMs);
    void arrival.then((api) => {
      clearTimeout(timeout);
      resolve(api);
    });
    loadScript(EMBED_API_URL).catch((error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

/**
 * Spotify's official Embed (iFrame API). Works without an account (30-second
 * previews) and plays full tracks for listeners signed in to Spotify in this
 * browser. Spotify Free may play ads inside the embed.
 */
export class SpotifyEmbedAdapter implements PlaybackAdapter {
  readonly name = "Spotify embed";
  readonly provider = "spotify" as const;
  readonly capabilities = { seek: true, volume: false };
  private controller: EmbedController | null = null;
  private wantPlay = false;
  private playing = false;
  /** The loaded song has played at some point, so Play resumes it instead of starting over. */
  private started = false;
  private last = { position: 0, duration: 0 };
  private nudge: ReturnType<typeof setTimeout> | null = null;
  /** Asks the embed to start again when it hasn't reported playback yet. */
  private kick: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private pendingSeek = 0;
  /** Albums, playlists and artists play in the taller embed, which lists and steps through their songs. */
  private collection = false;
  private height = 0;
  private uri = "";
  /** Increases on every load so a slower, older load can't replace the current player. */
  private seq = 0;
  private fallbackFrame: HTMLIFrameElement | null = null;

  constructor(private events: AdapterEvents) {}

  /**
   * A native Spotify iframe is more robust than the Iframe API when script
   * blockers or third-party cookie restrictions prevent its JS handshake.
   * The listener may press Play directly in the visible, official player.
   */
  private mountNativeEmbed(uri: string): void {
    const [scheme, kind, id] = uri.split(":");
    if (scheme !== "spotify" || !["track", "album", "playlist", "artist"].includes(kind) ||
        !/^[A-Za-z0-9]{22}$/.test(id ?? "")) {
      throw new Error("Invalid Spotify music link.");
    }
    this.controller?.destroy();
    this.controller = null;
    this.clearTimers();
    const host = hostElement("spotify");
    host.replaceChildren();
    const frame = document.createElement("iframe");
    frame.src = `https://open.spotify.com/embed/${kind}/${id}?utm_source=generator`;
    frame.title = "Spotify music player";
    frame.setAttribute("allow", "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture");
    frame.setAttribute("loading", "eager");
    frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    frame.style.cssText = "width:100%;height:100%;border:0;display:block;";
    frame.addEventListener("error", () =>
      this.events.onError({ message: "Spotify's embed could not load. Open this track on Spotify.", fatal: false, notice: true }),
    );
    host.appendChild(frame);
    this.fallbackFrame = frame;
    this.events.onState({ status: "paused", positionMs: 0 });
    this.events.onError({
      message: "Use the Play button inside the Spotify player. Your browser may restrict embedded playback.",
      fatal: false, notice: true,
    });
  }

  private async ensure(uri: string, seq: number): Promise<boolean> {
    const height = this.collection ? 352 : 152;
    if (this.controller && this.height === height) return false;
    this.controller?.destroy();
    this.controller = null;
    this.fallbackFrame = null;
    this.height = height;
    const api = await loadEmbedApi();
    if (seq !== this.seq) throw new Error("superseded");
    const host = hostElement("spotify");
    host.replaceChildren();
    const mount = document.createElement("div");
    host.appendChild(mount);
    const controller = await new Promise<EmbedController>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Spotify iframe API did not create a player. Switching to the standard player.")), 8000);
      try {
        api.createController(mount, { uri, width: "100%", height }, (c) => {
          clearTimeout(timer);
          resolve(c);
        });
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
    if (seq !== this.seq) {
      // A newer song was picked while this player was being created.
      controller.destroy();
      throw new Error("superseded");
    }
    this.controller = controller;
    controller.addListener("ready", () => {
      if (controller === this.controller && this.wantPlay && !this.started) this.start();
    });
    controller.addListener("playback_update", (e) => {
      if (controller !== this.controller) return;
      const d = e.data as { isPaused: boolean; isBuffering: boolean; duration: number; position: number };
      this.last = { position: d.position, duration: d.duration };
      if (!d.isPaused && this.kick) {
        // The embed took the play request (it may still be buffering); don't ask again.
        clearTimeout(this.kick);
        this.kick = null;
      }
      if (!d.isPaused && !d.isBuffering && this.pendingSeek) {
        const s = this.pendingSeek;
        this.pendingSeek = 0;
        this.controller?.seek(s / 1000);
      }
      if (d.isBuffering) return this.events.onState({ status: "buffering", positionMs: d.position, durationMs: d.duration });
      if (!d.isPaused) {
        this.playing = true;
        this.started = true;
        this.clearTimers();
        return this.events.onState({ status: "playing", positionMs: d.position, durationMs: d.duration });
      }
      // In a collection the embed moves on to the next song itself, so one song ending isn't the end.
      const ended = !this.collection && this.playing && d.duration > 0 && d.position >= d.duration - 750;
      this.playing = false;
      this.events.onState({ status: ended ? "ended" : "paused", positionMs: d.position, durationMs: d.duration });
    });
    return true;
  }

  private clearTimers() {
    if (this.nudge) clearTimeout(this.nudge);
    if (this.kick) clearTimeout(this.kick);
    this.nudge = this.kick = null;
  }

  /** Waits `ms`, then asks the embed to play if it still hasn't started. */
  private scheduleStart(ms: number) {
    if (this.kick) clearTimeout(this.kick);
    this.kick = setTimeout(() => {
      this.kick = null;
      if (this.wantPlay && !this.started && this.attempts < 3) this.start();
    }, ms);
  }

  /**
   * Starts the loaded song. Spotify can drop a play request that arrives while
   * the embed is still switching songs, so it is repeated a couple of times
   * until the embed reports playback.
   */
  private start() {
    if (!this.controller) return;
    this.attempts++;
    try {
      this.controller.play();
    } catch {
      /* The embed is still loading; the retry below asks again. */
    }
    this.scheduleStart(2500);
  }

  async load(track: Track, opts: LoadOptions) {
    const uri = uriFor(track);
    const seq = ++this.seq;
    this.uri = uri;
    this.collection = !!collectionKind(track);
    this.wantPlay = opts.autoplay;
    this.playing = false;
    this.started = false;
    this.attempts = 0;
    this.pendingSeek = opts.startMs;
    this.clearTimers();
    try {
      const created = await this.ensure(uri, seq);
      if (!created) this.controller!.loadUri(uri);
      // Never leave the toolbar stuck in "Loading..." when a browser denies autoplay.
      this.events.onState({ status: "paused", positionMs: opts.startMs });
      if (opts.autoplay) {
        // The embed's "ready" event starts the song; this covers embeds that don't send it after loadUri.
        this.scheduleStart(created ? 3000 : 800);
        this.nudge = setTimeout(() => {
          if (!this.playing)
            this.events.onError({
              message: "Press Play inside the Spotify widget. If it stays blank, open on Spotify.",
              fatal: false, notice: true,
            });
        }, 8000);
      }
    } catch {
      if (seq !== this.seq) return;
      // The official iframe needs no JS handshake; it is the final fallback
      // when the Iframe API does not initialize.
      this.mountNativeEmbed(uri);
    }
  }

  async play() {
    this.wantPlay = true;
    if (this.fallbackFrame) {
      // Spotify's player API may have finished loading since the fallback was shown.
      if (embedApi && this.uri) {
        const seq = ++this.seq;
        this.started = false;
        this.attempts = 0;
        try {
          await this.ensure(this.uri, seq);
          // The new embed's "ready" event starts the song; this covers a missed one.
          this.scheduleStart(3000);
        } catch {
          if (seq === this.seq) this.mountNativeEmbed(this.uri);
        }
        return;
      }
      this.events.onError({ message: "Press Play inside the Spotify widget to start the song.", fatal: false, notice: true });
      return;
    }
    if (!this.controller) return;
    if (this.started) {
      this.controller.resume();
      return;
    }
    // Nothing has played yet (the browser blocked autoplay): start the song.
    this.attempts = 0;
    this.start();
  }
  pause() {
    this.wantPlay = false;
    if (this.kick) clearTimeout(this.kick);
    this.kick = null;
    this.controller?.pause();
  }
  stop() {
    this.wantPlay = false;
    this.clearTimers();
    this.controller?.pause();
  }
  seek(ms: number) {
    this.controller?.seek(ms / 1000);
  }
  setVolume() {
    /* The Spotify embed does not expose volume control. */
  }
}

/* --------------------------------------------------- Web Playback SDK */

interface SdkState {
  paused: boolean;
  position: number;
  duration: number;
  loading?: boolean;
  track_window: { current_track: { id: string; uri: string } | null };
}
interface SdkPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: string, cb: (e: never) => void): void;
  getCurrentState(): Promise<SdkState | null>;
  resume(): Promise<void>;
  pause(): Promise<void>;
  seek(ms: number): Promise<void>;
  setVolume(v: number): Promise<void>;
  activateElement(): Promise<void>;
}

let sdkReady: Promise<void> | null = null;
function loadSdk() {
  if (window.Spotify?.Player) return Promise.resolve();
  if (sdkReady) return sdkReady;
  sdkReady = new Promise<void>((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    loadScript("https://sdk.scdn.co/spotify-player.js").catch(reject);
  });
  sdkReady.catch(() => (sdkReady = null));
  return sdkReady;
}

/**
 * Spotify Web Playback SDK: full-track playback in the browser for connected
 * Spotify Premium accounts, controlled through the Spotify Connect Web API.
 */
export class SpotifySdkAdapter implements PlaybackAdapter {
  readonly name = "Spotify Web Playback SDK";
  readonly provider = "spotify" as const;
  readonly capabilities = { seek: true, volume: true };
  private player: SdkPlayer | null = null;
  private deviceId: Promise<string> | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private pending: { uri: string; startMs: number } | null = null;
  private lastPos = 0;
  private lastDuration = 0;
  private volume = 1;
  private uri: string | null = null;
  /** Set when the account can't use the SDK (e.g. not Premium); the engine falls back to the embed. */
  unavailable: string | null = null;

  constructor(private events: AdapterEvents) {}

  private async ensure(): Promise<string> {
    if (this.deviceId) return this.deviceId;
    this.deviceId = (async () => {
      await loadSdk();
      const player = new window.Spotify!.Player({
        name: "Spotube Web",
        volume: this.volume,
        getOAuthToken: (cb: (t: string) => void) => {
          getUserToken().then((t) => t && cb(t));
        },
      });
      this.player = player;
      const id = new Promise<string>((resolve, reject) => {
        player.addListener("ready", ((e: { device_id: string }) => resolve(e.device_id)) as never);
        const fail = (msg: string) => ((e: { message: string }) => {
          this.unavailable = `${msg}: ${e.message}`;
          reject(new Error(this.unavailable));
          this.events.onError({ message: this.unavailable, fatal: true });
        }) as never;
        player.addListener("initialization_error", fail("Spotify player couldn't start in this browser"));
        player.addListener("authentication_error", fail("Spotify authentication failed"));
        player.addListener("account_error", fail("Full-track Spotify playback needs Spotify Premium"));
        setTimeout(() => reject(new Error("Spotify player timed out.")), 20000);
      });
      player.addListener("playback_error", ((e: { message: string }) =>
        this.events.onError({ message: `Spotify playback error: ${e.message}`, fatal: false })) as never);
      player.addListener("player_state_changed", ((s: SdkState | null) => this.handle(s)) as never);
      if (!(await player.connect())) throw new Error("Spotify player couldn't connect.");
      return id;
    })();
    this.deviceId.catch(() => (this.deviceId = null));
    return this.deviceId;
  }

  private handle(s: SdkState | null) {
    if (!s || !s.track_window.current_track || s.track_window.current_track.uri !== this.uri) return;
    const ended = s.paused && s.position === 0 && this.lastDuration > 0 && this.lastPos > this.lastDuration - 3000;
    this.lastPos = s.position;
    this.lastDuration = s.duration;
    if (ended) {
      this.stopPoll();
      return this.events.onState({ status: "ended", positionMs: s.duration, durationMs: s.duration });
    }
    if (s.loading) return this.events.onState({ status: "buffering", positionMs: s.position, durationMs: s.duration });
    if (s.paused) {
      this.stopPoll();
      this.events.onState({ status: "paused", positionMs: s.position, durationMs: s.duration });
    } else {
      this.startPoll();
      this.events.onState({ status: "playing", positionMs: s.position, durationMs: s.duration });
    }
  }

  private startPoll() {
    if (this.poll) return;
    this.poll = setInterval(async () => {
      const s = await this.player?.getCurrentState();
      if (s) this.handle(s);
    }, 500);
  }
  private stopPoll() {
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
  }

  private async startPlayback(uri: string, startMs: number) {
    const device = await this.ensure();
    const token = await getUserToken();
    if (!token) throw new Error("Spotify session expired. Connect again in Settings.");
    await this.player?.activateElement();
    const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(device)}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ uris: [uri], position_ms: Math.max(0, Math.round(startMs)) }),
    });
    if (res.status === 403) {
      this.unavailable = "Full-track Spotify playback needs Spotify Premium";
      throw new Error(this.unavailable);
    }
    if (!res.ok && res.status !== 202) throw new Error(`Spotify couldn't start playback (${res.status}).`);
  }

  async load(track: Track, opts: LoadOptions) {
    this.uri = uriFor(track);
    this.lastPos = 0;
    this.lastDuration = track.durationMs ?? 0;
    if (!opts.autoplay) {
      // Defer starting until the user presses play (restored sessions).
      this.pending = { uri: this.uri, startMs: opts.startMs };
      await this.player?.pause().catch(() => {});
      this.events.onState({ status: "paused", positionMs: opts.startMs, durationMs: track.durationMs });
      return;
    }
    this.pending = null;
    await this.startPlayback(this.uri, opts.startMs);
  }

  async play() {
    if (this.pending) {
      const { uri, startMs } = this.pending;
      this.pending = null;
      try {
        await this.startPlayback(uri, startMs);
      } catch (e) {
        this.events.onError({ message: (e as Error).message, fatal: true });
      }
      return;
    }
    await this.player?.resume();
  }
  pause() {
    void this.player?.pause();
  }
  stop() {
    this.stopPoll();
    void this.player?.pause().catch(() => {});
  }
  seek(ms: number) {
    if (this.pending) this.pending.startMs = ms;
    else void this.player?.seek(Math.round(ms));
  }
  setVolume(v: number) {
    this.volume = Math.max(0.0001, v);
    void this.player?.setVolume(v).catch(() => {});
  }
}
