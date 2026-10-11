import type { Track } from "./types";

export type CollectionKind = "album" | "playlist" | "artist";

/**
 * A whole album, playlist or artist saved as one item and played inside the
 * provider's own embedded player, which shows and steps through its songs.
 * This is how Spotify and SoundCloud links work on sites without API keys.
 */
export function collectionKind(t: Pick<Track, "provider" | "playbackRef">): CollectionKind | null {
  const ref = t.playbackRef ?? "";
  if (t.provider === "spotify") return (/^spotify:(album|playlist|artist):/.exec(ref)?.[1] as CollectionKind) ?? null;
  if (t.provider === "youtube" && /^playlist:[A-Za-z0-9_-]+$/.test(ref)) return "playlist";
  if (t.provider === "soundcloud" && /^https:\/\/api\.soundcloud\.com\/playlists\/\d+$/.test(ref)) return "playlist";
  return null;
}
