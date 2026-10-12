"use client";

import clsx from "clsx";
import { AlertCircle, ListMusic, Maximize2, Megaphone } from "lucide-react";
import Link from "next/link";
import { PlayPauseButton, SeekBar, TransportControls, VolumeControl } from "./Controls";
import { Artwork } from "@/components/Artwork";
import { LikeButton } from "@/components/TrackList";
import { ProviderBadge } from "@/components/ProviderBadge";
import { IconButton, Spinner } from "@/components/ui";
import { useLikedKeys } from "@/hooks/useLibrary";
import { currentTrack, next, setNowPlayingOpen, setQueueOpen, usePlayer } from "@/lib/player/engine";
import { pathFor } from "@/lib/providers";
import { useSettings } from "@/lib/settings";
import { artistNames, type ProviderId } from "@/lib/types";
import { SkipForward } from "lucide-react";

export const AD_NOTICE: Partial<Record<ProviderId, string>> = {
  youtube: "YouTube may show ads.",
  soundcloud: "SoundCloud may play ads.",
  spotify: "Spotify may play ads on free accounts.",
};

export function AdNotice({ provider, className }: { provider: ProviderId; className?: string }) {
  const { showAdNotices } = useSettings();
  const text = AD_NOTICE[provider];
  if (!showAdNotices || !text) return null;
  return (
    <span className={clsx("inline-flex items-center text-subtle", className)} title={text}>
      <Megaphone className="size-3.5" aria-hidden />
      <span className="sr-only">{text}</span>
    </span>
  );
}

export function PlayerBar() {
  const track = usePlayer((s) => currentTrack(s));
  const error = usePlayer((s) => s.error);
  const notice = usePlayer((s) => s.notice);
  const loading = usePlayer((s) => s.status === "loading");
  /** One short line about what the player is doing, when there's something to say. */
  const message = error ?? notice ?? (loading ? "Loading…" : undefined);
  const queueOpen = usePlayer((s) => s.queueOpen);
  const position = usePlayer((s) => s.positionMs);
  const duration = usePlayer((s) => s.durationMs);
  const liked = useLikedKeys();

  return (
    <footer className="relative z-40 border-t border-line bg-surface" aria-label="Player">
      {/* Mobile mini player */}
      <div className="md:hidden">
        <div className="h-0.5 bg-surface-3">
          <div className="h-full bg-fg" style={{ width: `${duration ? Math.min(100, (position / duration) * 100) : 0}%` }} />
        </div>
        <div className="flex items-center gap-3 px-3 py-2">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
            onClick={() => track && setNowPlayingOpen(true)}
            aria-label="Open now playing"
          >
            <Artwork src={track?.artwork} alt="" className="size-11" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{track?.title ?? "Nothing playing"}</span>
              <span className="block truncate text-xs text-muted">
                {message ? (
                  <span className={error ? "text-danger" : undefined}>{message}</span>
                ) : track ? (
                  artistNames(track)
                ) : (
                  "Search or paste a link to start"
                )}
              </span>
            </span>
          </button>
          {track && <LikeButton track={track} liked={liked.has(track.key)} />}
          <PlayPauseButton />
          <IconButton label="Next" onClick={() => next()} disabled={!track}>
            <SkipForward className="size-5 fill-current" />
          </IconButton>
        </div>
      </div>

      {/* Desktop / tablet */}
      <div className="hidden h-20 grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-4 px-4 md:grid">
        <div className="flex min-w-0 items-center gap-3">
          {track ? (
            <>
              <button type="button" onClick={() => setNowPlayingOpen(true)} aria-label="Open now playing">
                <Artwork src={track.artwork} alt="" className="size-14" />
              </button>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{track.title}</div>
                <div className="flex items-center gap-1.5 truncate text-xs text-muted">
                  <ProviderBadge provider={track.provider} />
                  {track.artists.map((a, i) => (
                    <span key={`${a.name}${i}`} className="truncate">
                      {a.id ? (
                        <Link href={pathFor("artist", track.provider, a.id)} className="hover:text-fg hover:underline">
                          {a.name}
                        </Link>
                      ) : (
                        a.name
                      )}
                      {i < track.artists.length - 1 && ","}
                    </span>
                  ))}
                  <AdNotice provider={track.provider} />
                </div>
              </div>
              <LikeButton track={track} liked={liked.has(track.key)} />
            </>
          ) : (
            <p className="text-sm text-muted">Nothing playing</p>
          )}
        </div>
        <div className="flex flex-col items-center gap-1">
          <TransportControls />
          <SeekBar className="max-w-xl" />
          {message && (
            <p role="status" className={clsx("flex items-center gap-1 text-xs", error ? "text-danger" : "text-muted")}>
              {loading && !error && !notice ? <Spinner className="size-3" /> : <AlertCircle className="size-3" />} {message}
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-1">
          <IconButton label="Queue (Q)" active={queueOpen} onClick={() => setQueueOpen(!queueOpen)} aria-pressed={queueOpen}>
            <ListMusic className="size-4" />
          </IconButton>
          <VolumeControl className="hidden lg:flex" />
          <IconButton label="Now playing view (F)" onClick={() => setNowPlayingOpen(true)} disabled={!track}>
            <Maximize2 className="size-4" />
          </IconButton>
        </div>
      </div>
    </footer>
  );
}
