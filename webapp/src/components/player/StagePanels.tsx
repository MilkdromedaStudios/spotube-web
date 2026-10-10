"use client";

import { StageSlot, stageHeight, useStageProvider } from "./MediaStage";
import { AD_NOTICE } from "./PlayerBar";
import { QueueList } from "./QueuePanel";
import { useSettings } from "@/lib/settings";
import { PROVIDER_LABELS } from "@/lib/types";

/** Right-hand "now playing" column on large screens, hosting the official provider player. */
export function StagePanel() {
  const provider = useStageProvider();
  const { showAdNotices } = useSettings();
  if (!provider) return null;
  return (
    <aside className="scrollbar-thin hidden w-[360px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-line bg-surface p-3 lg:flex" aria-label="Now playing">
      <p className="text-xs font-medium uppercase tracking-wide text-subtle">Playing on {PROVIDER_LABELS[provider]}</p>
      <StageSlot
        priority={50}
        className={provider === "youtube" ? "aspect-video w-full shrink-0" : "w-full shrink-0"}
        style={provider === "youtube" ? undefined : { height: stageHeight(provider, "panel") }}
      />
      {showAdNotices && AD_NOTICE[provider] && <p className="text-xs text-subtle">{AD_NOTICE[provider]}</p>}
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
  if (!provider) return null;
  return (
    <div className="shrink-0 border-t border-line bg-surface p-2 lg:hidden">
      <StageSlot priority={10} className="w-full" style={{ height: stageHeight(provider, "dock") }} />
    </div>
  );
}
