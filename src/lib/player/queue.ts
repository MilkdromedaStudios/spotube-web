import type { RepeatMode } from "@/lib/db/schema";

/** Fisher–Yates shuffle that keeps `keepFirst` (if given) at index 0. */
export function shuffled<T>(items: T[], keepFirst?: T, random: () => number = Math.random): T[] {
  const rest = keepFirst === undefined ? items.slice() : items.filter((x) => x !== keepFirst);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return keepFirst === undefined ? rest : [keepFirst, ...rest];
}

/** Index to move to after the current track; `null` means stop. */
export function nextIndex(index: number, length: number, repeat: RepeatMode): number | null {
  if (!length) return null;
  if (index + 1 < length) return index + 1;
  return repeat === "all" ? 0 : null;
}

/** Index for "previous"; restart the current track when more than 3 s in. */
export function previousIndex(index: number, length: number, repeat: RepeatMode, positionMs: number): number | "restart" {
  if (positionMs > 3000 || !length) return "restart";
  if (index > 0) return index - 1;
  return repeat === "all" ? length - 1 : "restart";
}

export function formatTime(ms?: number) {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return "--:--";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
