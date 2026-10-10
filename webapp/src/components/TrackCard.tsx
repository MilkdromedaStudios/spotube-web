"use client";

import clsx from "clsx";
import { Play } from "lucide-react";
import { Artwork } from "./Artwork";
import { ProviderBadge } from "./ProviderBadge";
import { Equalizer } from "./TrackList";
import { currentTrack, playTracks, usePlayer } from "@/lib/player/engine";
import { artistNames, type Track } from "@/lib/types";

/** Card for a single song; clicking plays the row of cards as a queue starting at this one. */
export function TrackCard({ track, list, index }: { track: Track; list: Track[]; index: number }) {
  const active = usePlayer((s) => currentTrack(s)?.key === track.key);
  const playing = usePlayer((s) => s.status === "playing");
  return (
    <button
      type="button"
      onClick={() => void playTracks(list, index)}
      className="group flex min-w-0 flex-col gap-2 rounded-xl p-2 text-left transition-colors hover:bg-surface-2"
      aria-label={`Play ${track.title} by ${artistNames(track)}`}
    >
      <div className="relative">
        <Artwork src={track.artwork} alt="" className="aspect-square w-full" />
        <span
          className={clsx(
            "absolute bottom-2 right-2 flex size-10 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg transition-opacity",
            active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          {active && playing ? <Equalizer /> : <Play className="size-4 fill-current" />}
        </span>
      </div>
      <span className="min-w-0">
        <span className={clsx("block truncate font-medium", active && "text-accent")}>{track.title}</span>
        <span className="flex items-center gap-1.5 text-sm text-muted">
          <ProviderBadge provider={track.provider} />
          <span className="truncate">{artistNames(track)}</span>
        </span>
      </span>
    </button>
  );
}
