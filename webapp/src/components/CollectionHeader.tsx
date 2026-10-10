"use client";

import { Play, Shuffle } from "lucide-react";
import type { ReactNode } from "react";
import { Artwork, type ArtworkKind } from "./Artwork";
import { ProviderBadge } from "./ProviderBadge";
import { Button, IconButton } from "./ui";
import { playTracks } from "@/lib/player/engine";
import type { ProviderId, Track } from "@/lib/types";

/** Header used by album, artist, playlist and Liked Songs pages. */
export function CollectionHeader({
  kind,
  label,
  title,
  artwork,
  meta,
  description,
  provider,
  tracks,
  actions,
  artworkSlot,
  titleSlot,
}: {
  kind: ArtworkKind;
  label: string;
  title: string;
  artwork?: string | Blob;
  meta?: ReactNode;
  description?: ReactNode;
  provider?: ProviderId;
  tracks: Track[];
  actions?: ReactNode;
  artworkSlot?: ReactNode;
  titleSlot?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-end">
        {artworkSlot ?? <Artwork src={artwork} alt={`Cover of ${title}`} kind={kind} className="size-48 shadow-2xl md:size-56" />}
        <div className="flex min-w-0 flex-col gap-2 text-center sm:text-left">
          <span className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted sm:justify-start">
            {provider && <ProviderBadge provider={provider} full />} {label}
          </span>
          {titleSlot ?? <h1 className="break-words text-3xl font-extrabold tracking-tight md:text-5xl">{title}</h1>}
          {description && <div className="text-sm text-muted">{description}</div>}
          {meta && <div className="text-sm text-muted">{meta}</div>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void playTracks(tracks, 0, { shuffle: false })}
          disabled={!tracks.length}
          aria-label={`Play ${title}`}
          className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg transition-transform hover:scale-105 disabled:opacity-40"
        >
          <Play className="ml-0.5 size-6 fill-current" />
        </button>
        <IconButton label={`Shuffle ${title}`} size="lg" disabled={!tracks.length} onClick={() => void playTracks(tracks, 0, { shuffle: true })}>
          <Shuffle className="size-6" />
        </IconButton>
        {actions}
      </div>
    </header>
  );
}

export function HeaderButton(props: React.ComponentProps<typeof Button>) {
  return <Button variant="outline" size="sm" {...props} />;
}
