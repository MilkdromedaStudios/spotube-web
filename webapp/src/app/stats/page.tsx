"use client";

import clsx from "clsx";
import { useLiveQuery } from "dexie-react-hooks";
import { BarChart3 } from "lucide-react";
import { useState } from "react";
import { Section } from "@/components/Cards";
import { Page } from "@/components/Page";
import { ProviderBadge } from "@/components/ProviderBadge";
import { TrackList } from "@/components/TrackList";
import { EmptyState, LoadingState } from "@/components/ui";
import { useDbStatus } from "@/lib/db/db";
import { listeningStats } from "@/lib/db/stats";
import { PROVIDER_LABELS } from "@/lib/types";

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: Infinity, label: "All time" },
];

function hours(ms: number) {
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : `${(m / 60).toFixed(1)} h`;
}

export default function StatsPage() {
  const [days, setDays] = useState(30);
  const ready = useDbStatus((s) => s.status === "ready");
  const stats = useLiveQuery(() => (ready ? listeningStats(days) : undefined), [ready, days]);
  const max = Math.max(1, ...(stats?.daily.map((d) => d.plays) ?? [1]));
  return (
    <Page
      title="Listening stats"
      actions={
        <div className="flex gap-2">
          {RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setDays(r.days)}
              aria-pressed={days === r.days}
              className={clsx("rounded-full px-3 py-1 text-sm", days === r.days ? "bg-fg text-bg" : "bg-surface-2")}
            >
              {r.label}
            </button>
          ))}
        </div>
      }
    >
      {!stats ? (
        <LoadingState />
      ) : !stats.plays ? (
        <EmptyState icon={<BarChart3 className="size-8" />} title="No listening data yet">
          Stats are calculated from the listening history stored in this browser.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Plays", stats.plays.toLocaleString()],
              ["Time listened", hours(stats.listenedMs)],
              ["Different songs", stats.uniqueTracks.toLocaleString()],
              ["Top source", stats.byProvider[0] ? PROVIDER_LABELS[stats.byProvider[0].provider] : "—"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-surface-2 p-4">
                <p className="text-sm text-muted">{k}</p>
                <p className="text-2xl font-bold">{v}</p>
              </div>
            ))}
          </div>
          <Section title={days === Infinity ? "Plays per day (last 30 days)" : "Plays per day"}>
            <div className="flex h-40 items-end gap-1" role="img" aria-label="Bar chart of plays per day">
              {stats.daily.map((d) => (
                <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end" title={`${d.day}: ${d.plays} plays, ${hours(d.listenedMs)}`}>
                  <div className="w-full rounded-t bg-accent/80 group-hover:bg-accent" style={{ height: `${(d.plays / max) * 100}%`, minHeight: d.plays ? 2 : 0 }} />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-xs text-subtle">
              <span>{stats.daily[0]?.day}</span>
              <span>{stats.daily[stats.daily.length - 1]?.day}</span>
            </div>
          </Section>
          <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
            <Section title="Top songs">
              <TrackList tracks={stats.topTracks.map((t) => t.track)} />
            </Section>
            <div className="flex flex-col gap-8">
              <Section title="Top artists">
                <ol className="flex flex-col gap-1">
                  {stats.topArtists.map((a, i) => (
                    <li key={a.name} className="flex items-center justify-between rounded-lg px-3 py-2 odd:bg-surface-2/50">
                      <span className="truncate">
                        <span className="mr-3 text-subtle">{i + 1}</span>
                        {a.name}
                      </span>
                      <span className="text-sm text-muted">{a.plays} plays</span>
                    </li>
                  ))}
                </ol>
              </Section>
              <Section title="By source">
                <ul className="flex flex-col gap-2">
                  {stats.byProvider.map((p) => (
                    <li key={p.provider} className="flex items-center gap-3">
                      <ProviderBadge provider={p.provider} full className="w-24 justify-center" />
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                        <div className="h-full bg-accent" style={{ width: `${(p.plays / stats.plays) * 100}%` }} />
                      </div>
                      <span className="w-12 text-right text-sm text-muted">{p.plays}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            </div>
          </div>
        </>
      )}
    </Page>
  );
}
