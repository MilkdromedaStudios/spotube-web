"use client";

import { StageSlot, stageHeight, useStageProvider } from "./MediaStage";
import { collectionKind } from "@/lib/collections";
import { currentTrack, usePlayer } from "@/lib/player/engine";
import { AD_NOTICE } from "./PlayerBar";
import { QueueList } from "./QueuePanel";
import { useSettings } from "@/lib/settings";
import { providerLabel } from "@/lib/types";
import { SpotifyPreviewPrompt } from "@/components/SpotifySignIn";

/** Right-hand "now playing" column on large screens, hosting the official provider player. */
export function StagePanel() {
  const provider = useStageProvider();
  const track = usePlayer((s) => currentTrack(s));
  const collection = track?.provider === "spotify" && !!collectionKind(track);
  const { showAdNotices } = useSettings();
  if (!provider) return null;
  return (
    <aside className="scrollbar-thin hidden w-[360px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-line bg-surface p-3 lg:flex" aria-label="Now playing">
      <p className="text-xs font-medium uppercase tracking-wide text-subtle">Playing on {providerLabel(provider)}</p>
      <StageSlot
        priority={50}
        className={provider === "youtube" ? "aspect-video w-full shrink-0" : "w-full shrink-0"}
        style={provider === "youtube" ? undefined : { height: stageHeight(provider, "panel", collection) }}
      />
      {showAdNotices && AD_NOTICE[provider] && <p className="text-xs text-subtle">{AD_NOTICE[provider]}</p>}
      {provider === "spotify" && <SpotifyPreviewPrompt />}
      {provider === "spotify" && track?.url && (
        <a className="text-xs text-muted hover:text-fg hover:underline" href={track.url} target="_blank" rel="noopener noreferrer">
          Not playing? Open in Spotify ↗
        </a>
      )}
      <div className="mt-2">
        <h2 className="mb-2 text-sm font-semibold">Up next</h2>
        <QueueList />
      </div>
    </aside>
  );
}

/** Below large screens the provider player sits in a dock above the player bar. */
export function MobileDock() {
  const provider = useStageProvider();
  const track = usePlayer((s) => currentTrack(s));
  const collection = track?.provider === "spotify" && !!collectionKind(track);
  if (!provider) return null;
  return (
    <div className="shrink-0 border-t border-line bg-surface p-2 lg:hidden">
      <StageSlot priority={10} className="w-full" style={{ height: stageHeight(provider, "dock", collection) }} />
      {provider === "spotify" && <SpotifyPreviewPrompt className="mt-1 block text-center" />}
    </div>
  );
}
