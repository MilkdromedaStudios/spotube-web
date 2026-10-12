import type { ArtistSummary, PlaylistSummary, Track } from "../../types";

/* Minimal shapes of the YouTube Data API v3 resources we read. */
export interface YtThumbs {
  default?: { url: string };
  medium?: { url: string };
  high?: { url: string };
  standard?: { url: string };
  maxres?: { url: string };
}
export interface YtVideo {
  id: string;
  snippet?: { title: string; channelTitle: string; channelId: string; thumbnails?: YtThumbs };
  contentDetails?: { duration?: string };
  status?: { embeddable?: boolean; privacyStatus?: string };
}
export interface YtSearchItem {
  id: { kind: string; videoId?: string; playlistId?: string; channelId?: string };
  snippet: { title: string; description?: string; channelTitle: string; channelId: string; thumbnails?: YtThumbs };
}
export interface YtPlaylist {
  id: string;
  snippet?: { title: string; description?: string; channelTitle?: string; thumbnails?: YtThumbs };
  contentDetails?: { itemCount?: number };
}
export interface YtChannel {
  id: string;
  snippet?: { title: string; thumbnails?: YtThumbs; customUrl?: string };
  statistics?: { subscriberCount?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'" };

export function decodeEntities(s: string) {
  return s
    .replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, e) => ENTITIES[e])
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

export function parseIsoDuration(iso?: string): number | undefined {
  if (!iso) return undefined;
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(iso);
  if (!m) return undefined;
  const [, d, h, min, s] = m.map((x) => (x ? Number(x) : 0));
  const ms = (((d * 24 + h) * 60 + min) * 60 + s) * 1000;
  return ms > 0 ? ms : undefined;
}

export const bestThumb = (t?: YtThumbs) => t?.maxres?.url ?? t?.high?.url ?? t?.medium?.url ?? t?.default?.url;

const NOISE =
  /\s*[([](official\s*(music\s*)?(video|audio|lyric(s)?\s*video|visuali[sz]er)|lyric(s)?(\s*video)?|audio|hd|hq|4k|mv|m\/v)[)\]]/gi;

/**
 * Turns a video title + channel into a track title and artist, the way
 * Spotube's YouTube engine does for "Artist - Title (Official Video)" uploads
 * and auto-generated "Artist - Topic" channels.
 */
export function splitTitle(rawTitle: string, channel: string, channelId?: string) {
  const title = decodeEntities(rawTitle).replace(NOISE, "").trim();
  const channelName = decodeEntities(channel);
  if (/ - Topic$/.test(channelName)) {
    return { title, artists: [{ id: channelId, name: channelName.replace(/ - Topic$/, "") }] };
  }
  const dash = title.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (dash) {
    return {
      title: dash[2].trim(),
      artists: dash[1].split(/\s*(?:,|&|\bx\b|\bfeat\.?|\bft\.?)\s*/i).filter(Boolean).map((name) => ({ name })),
    };
  }
  return { title, artists: [{ id: channelId, name: channelName.replace(/VEVO$/i, "").trim() || channelName }] };
}

export function ytVideoToTrack(v: YtVideo): Track | null {
  if (!v.snippet) return null;
  const { title, artists } = splitTitle(v.snippet.title, v.snippet.channelTitle, v.snippet.channelId);
  return {
    key: `youtube:${v.id}`,
    provider: "youtube",
    id: v.id,
    title,
    artists,
    artwork: bestThumb(v.snippet.thumbnails),
    durationMs: parseIsoDuration(v.contentDetails?.duration),
    url: `https://www.youtube.com/watch?v=${v.id}`,
    playbackRef: v.id,
  };
}

export function ytPlaylistToSummary(p: YtPlaylist | YtSearchItem): PlaylistSummary {
  const id = typeof p.id === "string" ? p.id : (p.id.playlistId as string);
  const snippet = p.snippet;
  return {
    key: `youtube:${id}`,
    provider: "youtube",
    id,
    name: decodeEntities(snippet?.title ?? "Untitled playlist"),
    owner: snippet?.channelTitle ? decodeEntities(snippet.channelTitle) : undefined,
    description: snippet?.description ? decodeEntities(snippet.description) : undefined,
    artwork: bestThumb(snippet?.thumbnails),
    trackCount: "contentDetails" in p ? p.contentDetails?.itemCount : undefined,
    url: `https://www.youtube.com/playlist?list=${id}`,
  };
}

export function ytChannelToArtist(c: YtChannel | YtSearchItem): ArtistSummary {
  const id = typeof c.id === "string" ? c.id : (c.id.channelId as string);
  const subs = "statistics" in c ? Number(c.statistics?.subscriberCount) : NaN;
  return {
    key: `youtube:${id}`,
    provider: "youtube",
    id,
    name: decodeEntities(c.snippet?.title ?? "Unknown channel").replace(/ - Topic$/, ""),
    artwork: bestThumb(c.snippet?.thumbnails),
    followers: Number.isFinite(subs) ? subs : undefined,
    url: `https://www.youtube.com/channel/${id}`,
  };
}
