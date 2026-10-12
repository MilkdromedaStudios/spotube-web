import clsx from "clsx";
import { providerLabel, type ProviderId } from "@/lib/types";

const STYLES: Record<ProviderId, string> = {
  youtube: "bg-red-500/15 text-red-400",
  spotify: "bg-green-500/15 text-green-400",
  soundcloud: "bg-orange-500/15 text-orange-400",
};

const SHORT: Record<ProviderId, string> = { youtube: "YT", spotify: "SP", soundcloud: "SC" };

export function ProviderBadge({ provider, full, className }: { provider: ProviderId; full?: boolean; className?: string }) {
  // Songs saved from a parked service (see disabled-providers/) get a plain grey badge.
  const label = providerLabel(provider);
  return (
    <span
      title={`Source: ${label}`}
      className={clsx(
        "inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        STYLES[provider] ?? "bg-white/10 text-muted",
        className,
      )}
    >
      {full ? label : (SHORT[provider] ?? label.slice(0, 2))}
      {!full && <span className="sr-only"> ({label})</span>}
    </span>
  );
}
