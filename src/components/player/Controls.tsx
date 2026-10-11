"use client";

import clsx from "clsx";
import { Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from "lucide-react";
import { useState } from "react";
import { IconButton, Spinner } from "@/components/ui";
import {
  cycleRepeat,
  next,
  previous,
  seek,
  setVolume,
  toggleMute,
  togglePlay,
  toggleShuffle,
  usePlayer,
} from "@/lib/player/engine";
import { formatTime } from "@/lib/player/queue";

export function PlayPauseButton({ size = "md" }: { size?: "md" | "lg" }) {
  const status = usePlayer((s) => s.status);
  const hasTrack = usePlayer((s) => s.index >= 0);
  const busy = status === "loading" || status === "buffering";
  const playing = status === "playing" || busy;
  return (
    <button
      type="button"
      onClick={togglePlay}
      disabled={!hasTrack}
      aria-label={playing ? "Pause" : "Play"}
      title={playing ? "Pause (Space)" : "Play (Space)"}
      className={clsx(
        "relative flex items-center justify-center rounded-full bg-fg text-bg transition-transform hover:scale-105 disabled:opacity-40 disabled:hover:scale-100",
        size === "lg" ? "size-16" : "size-10",
      )}
    >
      {busy && <Spinner className={clsx("absolute", size === "lg" ? "size-16 opacity-40" : "size-10 opacity-40")} label="Buffering" />}
      {playing ? (
        <Pause className={clsx("fill-current", size === "lg" ? "size-7" : "size-5")} />
      ) : (
        <Play className={clsx("fill-current", size === "lg" ? "ml-1 size-7" : "ml-0.5 size-5")} />
      )}
    </button>
  );
}

export function TransportControls({ size = "md" }: { size?: "md" | "lg" }) {
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const hasTrack = usePlayer((s) => s.index >= 0);
  const icon = size === "lg" ? "size-6" : "size-4";
  return (
    <div className={clsx("flex items-center", size === "lg" ? "gap-5" : "gap-2")}>
      <IconButton label={shuffle ? "Disable shuffle (S)" : "Enable shuffle (S)"} active={shuffle} onClick={toggleShuffle} aria-pressed={shuffle}>
        <Shuffle className={icon} />
      </IconButton>
      <IconButton label="Previous (Shift+P)" onClick={previous} disabled={!hasTrack}>
        <SkipBack className={clsx(icon, "fill-current")} />
      </IconButton>
      <PlayPauseButton size={size} />
      <IconButton label="Next (Shift+N)" onClick={() => next()} disabled={!hasTrack}>
        <SkipForward className={clsx(icon, "fill-current")} />
      </IconButton>
      <IconButton
        label={repeat === "off" ? "Repeat all (R)" : repeat === "all" ? "Repeat one (R)" : "Turn off repeat (R)"}
        active={repeat !== "off"}
        onClick={cycleRepeat}
      >
        {repeat === "one" ? <Repeat1 className={icon} /> : <Repeat className={icon} />}
      </IconButton>
    </div>
  );
}

export function SeekBar({ className }: { className?: string }) {
  const position = usePlayer((s) => s.positionMs);
  const duration = usePlayer((s) => s.durationMs);
  const canSeek = usePlayer((s) => s.canSeek);
  const hasTrack = usePlayer((s) => s.index >= 0);
  const [drag, setDrag] = useState<number | null>(null);
  const value = drag ?? position;
  const max = duration && duration > 0 ? duration : 0;
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={clsx("flex w-full items-center gap-2 text-xs tabular-nums text-muted", className)}>
      <span className="w-10 text-right">{hasTrack ? formatTime(value) : "--:--"}</span>
      <input
        type="range"
        className="slider flex-1"
        aria-label="Seek"
        min={0}
        max={max || 1}
        step={1000}
        value={max ? Math.min(value, max) : 0}
        disabled={!hasTrack || !canSeek || !max}
        style={{ "--pct": `${pct}%` } as React.CSSProperties}
        onChange={(e) => setDrag(Number(e.target.value))}
        onPointerUp={() => {
          if (drag !== null) seek(drag);
          setDrag(null);
        }}
        onKeyUp={() => {
          if (drag !== null) seek(drag);
          setDrag(null);
        }}
        aria-valuetext={`${formatTime(value)} of ${formatTime(duration)}`}
      />
      <span className="w-10">{hasTrack ? formatTime(duration) : "--:--"}</span>
    </div>
  );
}

export function VolumeControl({ className }: { className?: string }) {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const canSet = usePlayer((s) => s.canSetVolume);
  const v = muted ? 0 : volume;
  const Icon = v === 0 ? VolumeX : v < 0.5 ? Volume1 : Volume2;
  const hint = canSet ? undefined : "Use your device's volume for this song.";
  return (
    <div className={clsx("flex items-center gap-1", className)} title={hint}>
      <IconButton label={muted ? "Unmute (M)" : "Mute (M)"} onClick={toggleMute} disabled={!canSet}>
        <Icon className="size-4" />
      </IconButton>
      <input
        type="range"
        className="slider w-24"
        aria-label="Volume"
        min={0}
        max={100}
        value={Math.round(v * 100)}
        disabled={!canSet}
        style={{ "--pct": `${v * 100}%` } as React.CSSProperties}
        onChange={(e) => setVolume(Number(e.target.value) / 100)}
      />
    </div>
  );
}
