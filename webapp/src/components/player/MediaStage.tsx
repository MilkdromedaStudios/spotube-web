"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { HOST_IDS } from "@/lib/player/adapters/types";
import { currentTrack, usePlayer } from "@/lib/player/engine";
import { Artwork } from "@/components/Artwork";
import { PROVIDER_LABELS, type ProviderId } from "@/lib/types";

/** Providers whose official player is a visible embed. */
export const EMBED_PROVIDERS: ProviderId[] = ["youtube", "spotify", "soundcloud"];

export function useStageProvider(): ProviderId | null {
  return usePlayer((s) => {
    const t = currentTrack(s);
    return t && EMBED_PROVIDERS.includes(t.provider) ? t.provider : null;
  });
}

/** Height of a stage slot for the active provider. */
export function stageHeight(provider: ProviderId | null, place: "panel" | "dock" | "full") {
  if (!provider) return 0;
  if (provider === "spotify") return place === "dock" ? 80 : 152;
  if (provider === "soundcloud") return 166;
  return place === "dock" ? 200 : 0; // youtube uses aspect-ratio in panel/full
}

/**
 * Marks where the official provider player should appear. The single
 * MediaStage overlays itself on the highest-priority visible slot, so the
 * iframe never moves in the DOM (moving it would restart playback).
 */
export function StageSlot({ priority, className, style }: { priority: number; className?: string; style?: React.CSSProperties }) {
  return <div data-stage-slot={priority} className={className} style={style} aria-hidden />;
}

function findSlot(): DOMRect | null {
  const slots = [...document.querySelectorAll<HTMLElement>("[data-stage-slot]")]
    .map((el) => ({ el, p: Number(el.dataset.stageSlot), r: el.getBoundingClientRect() }))
    .filter((s) => s.r.width > 0 && s.r.height > 0)
    .sort((a, b) => b.p - a.p);
  return slots[0]?.r ?? null;
}

export function MediaStage() {
  const provider = useStageProvider();
  const nowPlaying = usePlayer((s) => s.nowPlayingOpen);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const last = useRef("");

  useEffect(() => {
    let raf = 0;
    const update = () => {
      const r = findSlot();
      const sig = r ? `${r.x},${r.y},${r.width},${r.height}` : "";
      if (sig !== last.current) {
        last.current = sig;
        setRect(r);
      }
    };
    const loop = () => {
      update();
      raf = window.setTimeout(loop, 200) as unknown as number;
    };
    loop();
    window.addEventListener("resize", update);
    return () => {
      clearTimeout(raf);
      window.removeEventListener("resize", update);
    };
  }, [provider, nowPlaying]);

  const visible = !!provider && !!rect;
  const track = usePlayer((s) => currentTrack(s));
  return (
    <div
      className={clsx(
        "fixed overflow-hidden rounded-xl bg-black shadow-2xl",
        nowPlaying ? "z-[75]" : "z-30",
        !visible && "pointer-events-none invisible",
      )}
      style={
        rect
          ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
          : { left: 0, bottom: 0, width: 1, height: 1 }
      }
    >
      {track && (
        // Shown until the provider's player has loaded (e.g. after restoring a session).
        <div className="absolute inset-0 flex items-center gap-3 p-4 text-sm text-white/70">
          <Artwork src={track.artwork} alt="" className="size-14" />
          <span>
            The official {PROVIDER_LABELS[track.provider]} player appears here when playback starts.
          </span>
        </div>
      )}
      {(Object.keys(HOST_IDS) as ProviderId[])
        .filter((p) => p !== "apple")
        .map((p) => (
          <div
            key={p}
            id={HOST_IDS[p]}
            className={clsx("relative size-full [&_iframe]:!h-full [&_iframe]:!w-full [&>div]:size-full", p !== provider && "hidden")}
          />
        ))}
      <div id={HOST_IDS.apple} className="hidden" />
    </div>
  );
}
