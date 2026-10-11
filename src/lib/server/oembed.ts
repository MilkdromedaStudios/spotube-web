import { ApiError, cached, upstreamError } from "./http";
import { providersConfigured } from "./env";
import { videosById } from "./youtube";
import { catalog } from "./spotify";
import { resolve as scResolve } from "./soundcloud";
import { decodeEntities } from "../providers/mappers/youtube";
import { spTrackToTrack, type SpTrack } from "../providers/mappers/spotify";
import type { ParsedLink } from "../providers/links";
import type { Track } from "../types";

interface OEmbed {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
  html?: string;
}

async function oembed(endpoint: string, url: string): Promise<OEmbed> {
  return cached(`oembed:${url}`, 24 * 3600, async () => {
    const u = new URL(endpoint);
    u.searchParams.set("url", url);
    u.searchParams.set("format", "json");
    const res = await fetch(u, { headers: { Accept: "application/json" } });
    if (res.status === 401 || res.status === 403)
      throw new ApiError(403, "unauthorized", "The owner doesn't allow this item to be embedded.");
    if (!res.ok) throw await upstreamError("Provider", res);
    return (await res.json()) as OEmbed;
  });
}

export type Resolved =
  | { kind: "track"; track: Track }
  | { kind: "album" | "artist" | "playlist"; provider: Track["provider"]; id: string };

/**
 * Turns a share link into a playable track using the providers' public,
 * key-less oEmbed endpoints (or the full APIs when they are configured).
 */
export async function resolveLink(link: ParsedLink): Promise<Resolved> {
  const configured = providersConfigured();

  if (link.provider === "youtube") {
    if (link.kind === "playlist" && !configured.youtube) {
      // Without an API key the whole playlist plays in YouTube's own player.
      const o = await oembed("https://www.youtube.com/oembed", link.url);
      return {
        kind: "track",
        track: {
          key: `youtube:playlist:${link.id}`,
          provider: "youtube",
          id: `playlist:${link.id}`,
          title: decodeEntities(o.title ?? "YouTube playlist"),
          artists: [{ name: (o.author_name ?? "YouTube").replace(/ - Topic$/, "") }],
          artwork: o.thumbnail_url,
          url: link.url,
          playbackRef: `playlist:${link.id}`,
        },
      };
    }
    if (link.kind !== "track") return { kind: link.kind, provider: "youtube", id: link.id };
    if (configured.youtube) {
      const [track] = await videosById([link.id]);
      if (!track) throw new ApiError(404, "not_found", "That video is unavailable or can't be embedded.");
      return { kind: "track", track };
    }
    const o = await oembed("https://www.youtube.com/oembed", link.url);
    return {
      kind: "track",
      track: {
        key: `youtube:${link.id}`,
        provider: "youtube",
        id: link.id,
        title: decodeEntities(o.title ?? "YouTube video"),
        artists: [{ name: (o.author_name ?? "YouTube").replace(/ - Topic$/, "") }],
        artwork: o.thumbnail_url,
        url: link.url,
        playbackRef: link.id,
      },
    };
  }

  if (link.provider === "spotify") {
    if (link.kind !== "track") {
      if (configured.spotify) return { kind: link.kind, provider: "spotify", id: link.id };
      // Without API keys the whole album, playlist or artist plays in Spotify's own embed.
      const o = await oembed("https://open.spotify.com/oembed", link.url);
      return {
        kind: "track",
        track: {
          key: `spotify:${link.kind}:${link.id}`,
          provider: "spotify",
          id: `${link.kind}:${link.id}`,
          title: o.title ?? `Spotify ${link.kind}`,
          artists: [{ name: `Spotify ${link.kind}` }],
          artwork: o.thumbnail_url,
          url: link.url,
          playbackRef: `spotify:${link.kind}:${link.id}`,
        },
      };
    }
    if (configured.spotify) {
      const t = spTrackToTrack((await catalog(`/v1/tracks/${link.id}`, new URLSearchParams())) as SpTrack);
      if (t) return { kind: "track", track: t };
    }
    const o = await oembed("https://open.spotify.com/oembed", link.url);
    return {
      kind: "track",
      track: {
        key: `spotify:${link.id}`,
        provider: "spotify",
        id: link.id,
        title: o.title ?? "Spotify track",
        artists: [{ name: "Spotify" }],
        artwork: o.thumbnail_url,
        url: link.url,
        playbackRef: `spotify:track:${link.id}`,
      },
    };
  }

  if (link.provider === "soundcloud") {
    if (configured.soundcloud) {
      const r = await scResolve(link.url);
      if (r.kind === "track" && r.track) return { kind: "track", track: r.track };
      if (r.kind === "playlist") return { kind: "playlist", provider: "soundcloud", id: r.playlist.id };
      if (r.kind === "artist") return { kind: "artist", provider: "soundcloud", id: r.artist.id };
      throw new ApiError(404, "not_found", "That SoundCloud track can't be played.");
    }
    const o = await oembed("https://soundcloud.com/oembed", link.url);
    const src = decodeURIComponent(/src="([^"]+)"/.exec(o.html ?? "")?.[1] ?? "");
    const m = /api\.soundcloud\.com\/(tracks|playlists)\/(\d+)/.exec(src);
    if (!m) throw new ApiError(404, "not_found", "That SoundCloud link couldn't be resolved.");
    const byMatch = /^(.*) by (.*)$/.exec(o.title ?? "");
    if (m[1] === "playlists")
      // Without API keys the whole set plays in SoundCloud's own widget.
      return {
        kind: "track",
        track: {
          key: `soundcloud:playlist:${m[2]}`,
          provider: "soundcloud",
          id: `playlist:${m[2]}`,
          title: byMatch?.[1] ?? o.title ?? "SoundCloud playlist",
          artists: [{ name: o.author_name ?? byMatch?.[2] ?? "SoundCloud" }],
          artwork: o.thumbnail_url,
          url: link.url,
          playbackRef: `https://api.soundcloud.com/playlists/${m[2]}`,
        },
      };
    return {
      kind: "track",
      track: {
        key: `soundcloud:${m[2]}`,
        provider: "soundcloud",
        id: m[2],
        title: byMatch?.[1] ?? o.title ?? "SoundCloud track",
        artists: [{ name: o.author_name ?? byMatch?.[2] ?? "SoundCloud" }],
        artwork: o.thumbnail_url,
        url: link.url,
        playbackRef: link.url,
      },
    };
  }

  // Apple Music links are resolved in the browser through MusicKit.
  throw new ApiError(400, "bad_request", "Apple Music links are opened with MusicKit in the browser.");
}
