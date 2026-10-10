"use client";

import { hostElement, loadScript, type AdapterEvents, type LoadOptions, type PlaybackAdapter } from "./types";
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

let embedApi: Promise<EmbedApi> | null = null;
function loadEmbedApi() {
  if (embedApi) return embedApi;
  embedApi = new Promise<EmbedApi>((resolve, reject) => {
    window.onSpotifyIframeApiReady = (api) => resolve(api);
    loadScript("https://open.spotify.com/embed/iframe-api/v1").catch(reject);
  });
  embedApi.catch(() => (embedApi = null));
  return embedApi;
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
  private last = { position: 0, duration: 0 };
  private nudge: ReturnType<typeof setTimeout> | null = null;
  private pendingSeek = 0;

  constructor(private events: AdapterEvents) {}

  private async ensure(uri: string): Promise<boolean> {
    if (this.controller) return false;
    const api = await loadEmbedApi();
    const host = hostElement("spotify");
    host.innerHTML = "";
    const mount = document.createElement("div");
    host.appendChild(mount);
    this.controller = await new Promise<EmbedController>((resolve) =>
      api.createController(mount, { uri, width: "100%", height: 152 }, (c) => resolve(c)),
    );
    this.controller.addListener("ready", () => {
      if (this.wantPlay) this.controller?.play();
    });
    this.controller.addListener("playback_update", (e) => {
      const d = e.data as { isPaused: boolean; isBuffering: boolean; duration: number; position: number };
      this.last = { position: d.position, duration: d.duration };
      if (!d.isPaused && !d.isBuffering && this.pendingSeek) {
        const s = this.pendingSeek;
        this.pendingSeek = 0;
        this.controller?.seek(s / 1000);
      }
      if (d.isBuffering) return this.events.onState({ status: "buffering", positionMs: d.position, durationMs: d.duration });
      if (!d.isPaused) {
        this.playing = true;
        this.clearNudge();
        return this.events.onState({ status: "playing", positionMs: d.position, durationMs: d.duration });
      }
      const ended = this.playing && d.duration > 0 && d.position >= d.duration - 750;
      this.playing = false;
      this.events.onState({ status: ended ? "ended" : "paused", positionMs: d.position, durationMs: d.duration });
    });
    return true;
  }

  private clearNudge() {
    if (this.nudge) clearTimeout(this.nudge);
    this.nudge = null;
  }

  async load(track: Track, opts: LoadOptions) {
    const uri = uriFor(track);
    this.wantPlay = opts.autoplay;
    this.playing = false;
    this.pendingSeek = opts.startMs;
    const created = await this.ensure(uri);
    if (!created) this.controller!.loadUri(uri);
    if (opts.autoplay) {
      this.controller!.play();
      this.clearNudge();
      // Browsers may block the embed from starting without a click inside it.
      this.nudge = setTimeout(() => {
        if (!this.playing)
          this.events.onError({ message: "Press play in the Spotify player to start this track.", fatal: false, notice: true });
      }, 5000);
    } else this.events.onState({ status: "paused", positionMs: 0 });
  }

  play() {
    this.wantPlay = true;
    this.controller?.resume();
  }
  pause() {
    this.wantPlay = false;
    this.controller?.pause();
  }
  stop() {
    this.wantPlay = false;
    this.clearNudge();
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
