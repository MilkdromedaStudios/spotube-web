import type { ProviderId, Track } from "./types";

/** Only strip presentation tags. Keep "live", "remix", "acoustic", etc. distinct. */
const PRESENTATION_TAG = /\s*[([]\s*(?:official\s+(?:music\s+)?(?:video|audio)|music\s+video|lyric(?:s)?(?:\s+video)?|audio|visuali[sz]er)\s*[)\]]/gi;

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function primaryArtist(track: Track): string {
  const name = track.artists[0]?.name ?? "";
  // YouTube artist channels often append " - Topic" or "VEVO".
  return normalize(name.replace(/\s*(?:-\s*topic|vevo)\s*$/i, ""));
}

function fingerprint(track: Track): string | null {
  const artist = primaryArtist(track);
  let title = track.title.replace(PRESENTATION_TAG, " ").trim();
  // Official YouTube uploads sometimes use "Artist - Song (Official Audio)".
  const dash = title.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (dash && normalize(dash[1]).replace(/\s/g, "") === artist.replace(/\s/g, "")) {
    title = dash[2];
  }
  const song = normalize(title);
  // Without both, an automatic match could collapse unrelated tracks.
  return song && artist ? `${song}::${artist.replace(/\s/g, "")}` : null;
}

function closeDuration(a: Track, b: Track): boolean {
  if (!a.durationMs || !b.durationMs) return true;
  const longest = Math.max(a.durationMs, b.durationMs);
  return Math.abs(a.durationMs - b.durationMs) <= Math.max(20_000, longest * 0.1);
}

/**
 * Combine track searches, preserving the original result order while replacing
 * a matching song with its preferred-provider version when available.
 *
 * Duplicate matching is intentionally conservative: primary artist, cleaned
 * song title and (when supplied) similar duration must agree.
 */
export function mergeTracksBySong(tracks: Track[], preferred: ProviderId): Track[] {
  const results: Track[] = [];
  const groups = new Map<string, { index: number; chosen: Track }[]>();
  const seenKeys = new Set<string>();

  for (const track of tracks) {
    if (seenKeys.has(track.key)) continue;
    seenKeys.add(track.key);
    const key = fingerprint(track);
    if (!key) {
      results.push(track);
      continue;
    }
    const candidates = groups.get(key) ?? [];
    const matched = candidates.find((candidate) => closeDuration(candidate.chosen, track));
    if (matched) {
      if (track.provider === preferred && matched.chosen.provider !== preferred) {
        results[matched.index] = track;
        matched.chosen = track;
      }
      continue;
    }
    const entry = { index: results.length, chosen: track };
    results.push(track);
    candidates.push(entry);
    groups.set(key, candidates);
  }
  return results;
}
