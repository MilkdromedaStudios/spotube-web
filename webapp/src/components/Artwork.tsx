"use client";

import clsx from "clsx";
import { Disc3, Heart, ListMusic, Mic2, Music2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useSettings } from "@/lib/settings";

export type ArtworkKind = "track" | "album" | "artist" | "playlist" | "liked";

const ICONS = { track: Music2, album: Disc3, artist: Mic2, playlist: ListMusic, liked: Heart };

/**
 * Remote artwork is loaded straight from the provider CDN with no referrer;
 * it can be switched off entirely in Settings → Privacy.
 */
export function Artwork({
  src,
  alt,
  kind = "track",
  className,
  rounded,
}: {
  src?: string | Blob;
  alt: string;
  kind?: ArtworkKind;
  className?: string;
  rounded?: boolean;
}) {
  const { loadArtwork } = useSettings();
  const [url, setUrl] = useState<string | undefined>(typeof src === "string" ? src : undefined);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    if (src instanceof Blob) {
      const u = URL.createObjectURL(src);
      setUrl(u);
      return () => URL.revokeObjectURL(u);
    }
    setUrl(src);
  }, [src]);
  const Icon = ICONS[kind];
  const isRemote = typeof src === "string";
  const show = url && !failed && (loadArtwork || !isRemote);
  return (
    <div
      className={clsx(
        "relative shrink-0 overflow-hidden bg-surface-3",
        rounded || kind === "artist" ? "rounded-full" : "rounded-md",
        kind === "liked" && "bg-gradient-to-br from-indigo-600 to-sky-400",
        className,
      )}
    >
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <div className="flex size-full items-center justify-center" aria-label={alt} role="img">
          <Icon className={clsx("size-2/5", kind === "liked" ? "fill-white text-white" : "text-subtle")} />
        </div>
      )}
    </div>
  );
}
