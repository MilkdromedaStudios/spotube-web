"use client";

import { ChevronDown, ListMusic, ListPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { SeekBar, TransportControls, VolumeControl } from "./Controls";
import { EMBED_PROVIDERS, StageSlot, useStageProvider } from "./MediaStage";
import { AD_NOTICE } from "./PlayerBar";
import { QueueList } from "./QueuePanel";
import { Artwork } from "@/components/Artwork";
import { ProviderBadge } from "@/components/ProviderBadge";
import { SpotifyPreviewPrompt } from "@/components/SpotifySignIn";
import { LikeButton } from "@/components/TrackList";
import { Button, IconButton } from "@/components/ui";
import { useLikedKeys } from "@/hooks/useLibrary";
import { currentTrack, setNowPlayingOpen, usePlayer } from "@/lib/player/engine";
import { useSettings } from "@/lib/settings";
import { artistNames, PROVIDER_LABELS } from "@/lib/types";
import { openAddToPlaylist } from "@/lib/uiStore";

/** Full-screen now-playing view. The provider's official player is shown in place of the artwork. */
export function NowPlaying() {
  const open = usePlayer((s) => s.nowPlayingOpen);
  const track = usePlayer((s) => currentTrack(s));
  const error = usePlayer((s) => s.error);
  const notice = usePlayer((s) => s.notice);
  const stage = useStageProvider();
  const liked = useLikedKeys();
  const { showAdNotices } = useSettings();
  const [tab, setTab] = useState<"player" | "queue">("player");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setNowPlayingOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open || !track) return null;
  const embed = EMBED_PROVIDERS.includes(track.provider);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Now playing"
      className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-bg"
    >
      {!embed && track.artwork && (
        <div className="pointer-events-none absolute inset-0 opacity-30 blur-3xl">
          <Artwork src={track.artwork} alt="" className="size-full" />
        </div>
      )}
      <div className="relative flex items-center justify-between px-4 py-3">
        <IconButton label="Close now playing (Esc)" onClick={() => setNowPlayingOpen(false)}>
          <ChevronDown className="size-6" />
        </IconButton>
        <div className="flex rounded-full bg-surface-2 p-1 text-sm lg:hidden">
          {(["player", "queue"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-full px-3 py-1 capitalize ${tab === t ? "bg-surface-3 text-fg" : "text-muted"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <span className="hidden text-xs text-muted sm:block">{track ? `Playing on ${PROVIDER_LABELS[track.provider]}` : ""}</span>
      </div>
      <div className="relative grid flex-1 grid-cols-1 gap-8 overflow-hidden px-4 pb-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:px-10">
        <div className={`flex min-h-0 flex-col items-center justify-center gap-6 ${tab === "queue" ? "hidden lg:flex" : ""}`}>
          {embed && stage ? (
            <StageSlot
              priority={100}
              className={track.provider === "youtube" ? "aspect-video w-full max-w-3xl" : "w-full max-w-xl"}
              style={track.provider === "youtube" ? undefined : { height: track.provider === "spotify" ? 352 : 300 }}
            />
          ) : (
            <Artwork src={track.artwork} alt={`Artwork for ${track.title}`} className="aspect-square w-full max-w-[min(70vw,28rem)] shadow-2xl" />
          )}
          <div className="flex w-full max-w-xl flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="truncate text-2xl font-bold">{track.title}</h2>
                <p className="flex items-center gap-2 truncate text-muted">
                  <ProviderBadge provider={track.provider} full />
                  <span className="truncate">
                    {artistNames(track)}
                    {track.album ? ` — ${track.album.name}` : ""}
                  </span>
                </p>
              </div>
              <div className="flex shrink-0 items-center">
                <IconButton label="Add to playlist" onClick={() => openAddToPlaylist([track])}>
                  <ListPlus className="size-5" />
                </IconButton>
                <LikeButton track={track} liked={liked.has(track.key)} />
              </div>
            </div>
            <SeekBar />
            <div className="flex justify-center">
              <TransportControls size="lg" />
            </div>
            <div className="flex items-center justify-center gap-3">
              <VolumeControl />
              <Button size="sm" variant="ghost" className="lg:hidden" onClick={() => setTab("queue")}>
                <ListMusic className="size-4" /> Queue
              </Button>
            </div>
            {(error || notice) && <p className={`text-center text-sm ${error ? "text-danger" : "text-muted"}`}>{error ?? notice}</p>}
            {track.provider === "spotify" && <SpotifyPreviewPrompt className="self-center text-center" />}
            {showAdNotices && AD_NOTICE[track.provider] && (
              <p className="text-center text-xs text-subtle">{AD_NOTICE[track.provider]}</p>
            )}
          </div>
        </div>
        <div className={`scrollbar-thin min-h-0 overflow-y-auto rounded-2xl bg-surface/70 p-3 ${tab === "player" ? "hidden lg:block" : ""}`}>
          <h3 className="mb-2 px-2 text-lg font-semibold">Queue</h3>
          <QueueList />
        </div>
      </div>
    </div>
  );
}
