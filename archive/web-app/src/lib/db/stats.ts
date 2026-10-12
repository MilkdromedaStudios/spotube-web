import { getDb } from "./db";
import type { HistoryRecord, TrackRecord } from "./schema";
import type { ProviderId } from "@/lib/types";

export interface ListeningStats {
  plays: number;
  listenedMs: number;
  uniqueTracks: number;
  topTracks: { track: TrackRecord; plays: number }[];
  topArtists: { name: string; plays: number }[];
  byProvider: { provider: ProviderId; plays: number }[];
  /** Plays per day, oldest first, for the selected window (max 30 bars) */
  daily: { day: string; plays: number; listenedMs: number }[];
}

const dayKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Pure aggregation, separated for testing. */
export function aggregate(rows: HistoryRecord[], tracks: Map<string, TrackRecord>, days: number, now = Date.now()): ListeningStats {
  const perTrack = new Map<string, number>();
  const perArtist = new Map<string, number>();
  const perProvider = new Map<ProviderId, number>();
  const perDay = new Map<string, { plays: number; listenedMs: number }>();
  let listenedMs = 0;
  for (const h of rows) {
    listenedMs += h.listenedMs;
    perTrack.set(h.trackKey, (perTrack.get(h.trackKey) ?? 0) + 1);
    perProvider.set(h.provider, (perProvider.get(h.provider) ?? 0) + 1);
    const t = tracks.get(h.trackKey);
    for (const a of t?.artists ?? []) perArtist.set(a.name, (perArtist.get(a.name) ?? 0) + 1);
    const k = dayKey(h.playedAt);
    const d = perDay.get(k) ?? { plays: 0, listenedMs: 0 };
    d.plays++;
    d.listenedMs += h.listenedMs;
    perDay.set(k, d);
  }
  const bars = Math.min(days, 30);
  const daily = Array.from({ length: bars }, (_, i) => {
    const k = dayKey(now - (bars - 1 - i) * 86_400_000);
    return { day: k, ...(perDay.get(k) ?? { plays: 0, listenedMs: 0 }) };
  });
  return {
    plays: rows.length,
    listenedMs,
    uniqueTracks: perTrack.size,
    topTracks: [...perTrack]
      .sort((a, b) => b[1] - a[1])
      .flatMap(([k, plays]) => (tracks.get(k) ? [{ track: tracks.get(k)!, plays }] : []))
      .slice(0, 10),
    topArtists: [...perArtist].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, plays]) => ({ name, plays })),
    byProvider: [...perProvider].sort((a, b) => b[1] - a[1]).map(([provider, plays]) => ({ provider, plays })),
    daily,
  };
}

export async function listeningStats(days: number): Promise<ListeningStats> {
  const db = getDb();
  const since = days === Infinity ? 0 : Date.now() - days * 86_400_000;
  const rows = await db.history.where("playedAt").aboveOrEqual(since).toArray();
  const keys = [...new Set(rows.map((r) => r.trackKey))];
  const tracks = await db.tracks.bulkGet(keys);
  const map = new Map(tracks.filter((t): t is TrackRecord => !!t).map((t) => [t.key, t]));
  return aggregate(rows, map, days === Infinity ? 30 : days);
}
