import "server-only";
import { env } from "./env";
import { ApiError, cached, upstreamError } from "./http";
import {
  ytChannelToArtist,
  ytPlaylistToSummary,
  ytVideoToTrack,
  type YtChannel,
  type YtPlaylist,
  type YtSearchItem,
  type YtVideo,
} from "@/lib/providers/mappers/youtube";
import type { SearchResults, SearchType, Track } from "@/lib/types";

const API = "https://www.googleapis.com/youtube/v3";

function key() {
  const k = env("YOUTUBE_API_KEY");
  if (!k) throw new ApiError(503, "not_configured", "YouTube search needs a YOUTUBE_API_KEY on the server.");
  return k;
}

async function yt<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  url.searchParams.set("key", key());
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw await upstreamError("YouTube", res);
  return (await res.json()) as T;
}

/** Fetches full video resources (duration, embeddable flag) and maps playable ones to tracks. */
export async function videosById(ids: string[]): Promise<Track[]> {
  const out: Track[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const data = await yt<{ items: YtVideo[] }>("videos", { part: "snippet,contentDetails,status", id: chunk.join(",") });
    const byId = new Map(data.items.map((v) => [v.id, v]));
    for (const id of chunk) {
      const v = byId.get(id);
      if (!v || v.status?.embeddable === false) continue; // can't be played in the official embed
      const t = ytVideoToTrack(v);
      if (t) out.push(t);
    }
  }
  return out;
}

export async function search(q: string, types: SearchType[], pageToken?: string) {
  return cached(`yt:search:${types.join(",")}:${q.toLowerCase()}:${pageToken ?? ""}`, 3600, async () => {
    const results: SearchResults & { nextPageToken?: string } = { tracks: [], albums: [], artists: [], playlists: [] };
    const jobs: Promise<void>[] = [];
    if (types.includes("tracks")) {
      jobs.push(
        (async () => {
          const s = await yt<{ items: YtSearchItem[]; nextPageToken?: string }>("search", {
            part: "snippet",
            type: "video",
            videoCategoryId: 10, // Music
            videoEmbeddable: "true",
            maxResults: 20,
            q,
            pageToken,
          });
          results.nextPageToken = s.nextPageToken;
          results.tracks = await videosById(s.items.map((i) => i.id.videoId!).filter(Boolean));
        })(),
      );
    }
    if (types.includes("playlists")) {
      jobs.push(
        yt<{ items: YtSearchItem[] }>("search", { part: "snippet", type: "playlist", maxResults: 12, q }).then((s) => {
          results.playlists = s.items.map(ytPlaylistToSummary);
        }),
      );
    }
    if (types.includes("artists")) {
      jobs.push(
        yt<{ items: YtSearchItem[] }>("search", { part: "snippet", type: "channel", maxResults: 8, q }).then((s) => {
          results.artists = s.items.map(ytChannelToArtist);
        }),
      );
    }
    await Promise.all(jobs);
    return results;
  });
}

export async function playlist(id: string, pageToken?: string) {
  return cached(`yt:playlist:${id}:${pageToken ?? ""}`, 1800, async () => {
    const [meta, items] = await Promise.all([
      pageToken
        ? Promise.resolve(null)
        : yt<{ items: YtPlaylist[] }>("playlists", { part: "snippet,contentDetails", id }),
      yt<{ items: { contentDetails: { videoId: string } }[]; nextPageToken?: string }>("playlistItems", {
        part: "contentDetails",
        playlistId: id,
        maxResults: 50,
        pageToken,
      }),
    ]);
    if (meta && !meta.items.length) throw new ApiError(404, "not_found", "That YouTube playlist doesn't exist or is private.");
    return {
      playlist: meta ? ytPlaylistToSummary(meta.items[0]) : null,
      tracks: await videosById(items.items.map((i) => i.contentDetails.videoId)),
      nextPageToken: items.nextPageToken ?? null,
    };
  });
}

export async function channel(id: string) {
  return cached(`yt:channel:${id}`, 3600, async () => {
    const c = await yt<{ items: YtChannel[] }>("channels", { part: "snippet,statistics,contentDetails", id });
    if (!c.items.length) throw new ApiError(404, "not_found", "That YouTube channel doesn't exist.");
    const [popular, playlists] = await Promise.all([
      yt<{ items: YtSearchItem[] }>("search", {
        part: "snippet",
        channelId: id,
        type: "video",
        order: "viewCount",
        maxResults: 20,
      }),
      yt<{ items: YtPlaylist[] }>("playlists", { part: "snippet,contentDetails", channelId: id, maxResults: 12 }),
    ]);
    return {
      artist: ytChannelToArtist(c.items[0]),
      topTracks: await videosById(popular.items.map((i) => i.id.videoId!).filter(Boolean)),
      playlists: playlists.items.map(ytPlaylistToSummary),
    };
  });
}

export async function trending(regionCode?: string) {
  const region = (regionCode || env("YOUTUBE_REGION_CODE") || "US").toUpperCase();
  return cached(`yt:trending:${region}`, 3 * 3600, async () => {
    const data = await yt<{ items: YtVideo[] }>("videos", {
      part: "snippet,contentDetails,status",
      chart: "mostPopular",
      videoCategoryId: 10,
      regionCode: region,
      maxResults: 24,
    });
    return {
      tracks: data.items
        .filter((v) => v.status?.embeddable !== false)
        .map(ytVideoToTrack)
        .filter((t): t is Track => !!t),
    };
  });
}
