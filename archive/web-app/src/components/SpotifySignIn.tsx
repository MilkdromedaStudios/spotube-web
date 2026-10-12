"use client";

import clsx from "clsx";
import type { ReactNode } from "react";
import { usePlayer } from "@/lib/player/engine";
import { onSpotifySignInOpened, SPOTIFY_SIGN_IN_URL } from "@/lib/spotifySignIn";

/** Opens Spotify's sign-in page in a new tab; Spotify's player here reloads when the listener comes back. */
export function SpotifySignInLink({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <a href={SPOTIFY_SIGN_IN_URL} target="_blank" rel="noopener noreferrer" onClick={onSpotifySignInOpened} className={className}>
      {children ?? "Sign in to Spotify"}
    </a>
  );
}

const button =
  "inline-flex h-8 items-center justify-center gap-2 rounded-full bg-accent px-3 text-sm font-medium text-accent-fg hover:brightness-110";

/**
 * Shown with Spotify's player. When only a 30-second preview is playing, it says so and offers
 * sign-in; otherwise it is a small link for listeners who hear previews.
 */
export function SpotifyPreviewPrompt({ className }: { className?: string }) {
  const preview = usePlayer((s) => s.preview);
  if (preview)
    return (
      <div className={clsx("flex flex-wrap items-center gap-2 rounded-lg bg-accent/10 p-2 text-xs", className)} role="status">
        <span className="flex-1">You&apos;re hearing a 30-second preview.</span>
        <SpotifySignInLink className={button}>Sign in for full songs</SpotifySignInLink>
      </div>
    );
  return (
    <SpotifySignInLink className={clsx("text-xs text-accent hover:underline", className)}>
      Only hearing previews? Sign in to Spotify ↗
    </SpotifySignInLink>
  );
}

export { button as signInButtonClass };
