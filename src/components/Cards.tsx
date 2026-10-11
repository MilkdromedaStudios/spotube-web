"use client";

import clsx from "clsx";
import { Play } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Artwork, type ArtworkKind } from "./Artwork";
import { ProviderBadge } from "./ProviderBadge";
import { Spinner } from "./ui";
import { playTracks } from "@/lib/player/engine";
import { pathFor, providers } from "@/lib/providers";
import { toast } from "@/lib/toast";
import type { AlbumSummary, ArtistSummary, PlaylistSummary, ProviderId, Track } from "@/lib/types";

export function MediaCard({
  href,
  title,
  subtitle,
  artwork,
  kind,
  provider,
  onPlay,
}: {
  href: string;
  title: string;
  subtitle?: ReactNode;
  artwork?: string | Blob;
  kind: ArtworkKind;
  provider?: ProviderId;
  onPlay?: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="group relative flex w-full min-w-0 flex-col gap-2 rounded-xl p-2 transition-colors hover:bg-surface-2">
      <div className="relative">
        <Artwork src={artwork} alt="" kind={kind} className="aspect-square w-full" />
        {onPlay && (
          <button
            type="button"
            aria-label={`Play ${title}`}
            onClick={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await onPlay();
              } catch (err) {
                toast.error((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
            className={clsx(
              "absolute bottom-2 right-2 z-10 flex size-11 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg transition-all",
              busy ? "opacity-100" : "translate-y-1 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 focus:translate-y-0 focus:opacity-100",
            )}
          >
            {busy ? <Spinner className="size-5" /> : <Play className="size-5 fill-current" />}
          </button>
        )}
      </div>
      <Link href={href} className="min-w-0 after:absolute after:inset-0">
        <span className={clsx("block truncate font-medium", kind === "artist" && "text-center")}>{title}</span>
        {(subtitle || provider) && (
          <span className={clsx("flex items-center gap-1.5 text-sm text-muted", kind === "artist" && "justify-center")}>
            {provider && <ProviderBadge provider={provider} />}
            <span className="truncate">{subtitle}</span>
          </span>
        )}
      </Link>
    </div>
  );
}

export function CardGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-7">{children}</div>;
}

export function CardRow({ children }: { children: ReactNode }) {
  return (
    <div className="scrollbar-thin -mx-2 flex snap-x gap-1 overflow-x-auto pb-2 [&>*]:w-40 [&>*]:shrink-0 [&>*]:snap-start sm:[&>*]:w-44">
      {children}
    </div>
  );
}

const playRemote = (load: () => Promise<Track[]>) => async () => {
  const tracks = await load();
  if (!tracks.length) throw new Error("No playable tracks found.");
  await playTracks(tracks, 0);
};

export function AlbumCard({ album }: { album: AlbumSummary }) {
  const p = providers[album.provider];
  return (
    <MediaCard
      href={pathFor("album", album.provider, album.id)}
      title={album.name}
      subtitle={[album.year, album.artists.map((a) => a.name).join(", ")].filter(Boolean).join(" • ")}
      artwork={album.artwork}
      kind="album"
      provider={album.provider}
      onPlay={p.album ? playRemote(async () => (await p.album!(album.id)).tracks) : undefined}
    />
  );
}

export function PlaylistCard({ playlist }: { playlist: PlaylistSummary }) {
  return (
    <MediaCard
      href={pathFor("playlist", playlist.provider, playlist.id)}
      title={playlist.name}
      subtitle={playlist.owner ? `By ${playlist.owner}` : playlist.trackCount ? `${playlist.trackCount} tracks` : undefined}
      artwork={playlist.artwork}
      kind="playlist"
      provider={playlist.provider}
      onPlay={playRemote(async () => (await providers[playlist.provider].playlist(playlist.id)).tracks)}
    />
  );
}

export function ArtistCard({ artist }: { artist: ArtistSummary }) {
  return (
    <MediaCard
      href={pathFor("artist", artist.provider, artist.id)}
      title={artist.name}
      subtitle="Artist"
      artwork={artist.artwork}
      kind="artist"
      provider={artist.provider}
    />
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
