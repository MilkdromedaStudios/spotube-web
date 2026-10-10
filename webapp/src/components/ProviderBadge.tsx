import clsx from "clsx";
import { PROVIDER_LABELS, type ProviderId } from "@/lib/types";

const STYLES: Record<ProviderId, string> = {
  youtube: "bg-red-500/15 text-red-400",
  spotify: "bg-green-500/15 text-green-400",
  soundcloud: "bg-orange-500/15 text-orange-400",
  apple: "bg-pink-500/15 text-pink-400",
};

const SHORT: Record<ProviderId, string> = { youtube: "YT", spotify: "SP", soundcloud: "SC", apple: "AM" };

export function ProviderBadge({ provider, full, className }: { provider: ProviderId; full?: boolean; className?: string }) {
  return (
    <span
      title={`Source: ${PROVIDER_LABELS[provider]}`}
      className={clsx("inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", STYLES[provider], className)}
    >
      {full ? PROVIDER_LABELS[provider] : SHORT[provider]}
      {!full && <span className="sr-only"> ({PROVIDER_LABELS[provider]})</span>}
    </span>
  );
}
