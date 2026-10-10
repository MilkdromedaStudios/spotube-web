import type { ProviderId } from "@/lib/types";

export type LinkKind = "track" | "album" | "artist" | "playlist";

export interface ParsedLink {
  provider: ProviderId;
  kind: LinkKind;
  id: string;
  /** Canonical URL to hand to the provider (oEmbed, widget, resolve) */
  url: string;
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Recognises share links from the supported providers, including
 * YouTube Music, Spotify URIs and Apple Music song links.
 */
export function parseMusicLink(input: string): ParsedLink | null {
  const text = input.trim();
  const spUri = /^spotify:(track|album|artist|playlist):([A-Za-z0-9]{22})$/.exec(text);
  if (spUri) {
    const [, kind, id] = spUri;
    return { provider: "spotify", kind: kind as LinkKind, id, url: `https://open.spotify.com/${kind}/${id}` };
  }
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (!u.hostname.includes(".")) return null;
  const host = u.hostname.replace(/^(www|m)\./, "");
  const parts = u.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") {
    const id = parts[0];
    return id && YT_ID.test(id) ? yt("track", id) : null;
  }
  if (host === "youtube.com" || host === "music.youtube.com" || host === "youtube-nocookie.com") {
    const v = u.searchParams.get("v");
    if (parts[0] === "watch" && v && YT_ID.test(v)) return yt("track", v);
    if ((parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live") && parts[1] && YT_ID.test(parts[1]))
      return yt("track", parts[1]);
    const list = u.searchParams.get("list");
    if (parts[0] === "playlist" && list) return yt("playlist", list);
    if (parts[0] === "browse" && parts[1]?.startsWith("MPREb")) return null; // YT Music album pages have no public API id
    if (parts[0] === "channel" && parts[1]) return yt("artist", parts[1]);
    return null;
  }

  if (host === "open.spotify.com" || host === "play.spotify.com") {
    const p = parts[0]?.startsWith("intl-") ? parts.slice(1) : parts;
    const [kind, id] = p;
    if (["track", "album", "artist", "playlist"].includes(kind) && /^[A-Za-z0-9]{22}$/.test(id ?? ""))
      return { provider: "spotify", kind: kind as LinkKind, id, url: `https://open.spotify.com/${kind}/${id}` };
    return null;
  }

  if (host === "soundcloud.com" || host === "on.soundcloud.com") {
    if (!parts.length) return null;
    const clean = `https://${host}/${parts.join("/")}`;
    if (host === "on.soundcloud.com") return { provider: "soundcloud", kind: "track", id: clean, url: clean };
    if (parts.length === 1) return { provider: "soundcloud", kind: "artist", id: clean, url: clean };
    if (parts[1] === "sets" && parts[2]) return { provider: "soundcloud", kind: "playlist", id: clean, url: clean };
    if (["tracks", "albums", "sets", "reposts", "likes", "followers", "following"].includes(parts[1]))
      return { provider: "soundcloud", kind: "artist", id: `https://soundcloud.com/${parts[0]}`, url: `https://soundcloud.com/${parts[0]}` };
    return { provider: "soundcloud", kind: "track", id: clean, url: clean };
  }

  if (host === "music.apple.com") {
    // /{storefront}/{album|playlist|artist|song}/{slug}/{id}?i={songId}
    const [, kind, ...rest] = parts;
    const id = rest[rest.length - 1];
    const songId = u.searchParams.get("i");
    if (kind === "album" && songId) return apple("track", songId, u);
    if (kind === "song" && id) return apple("track", id, u);
    if (kind === "album" && id) return apple("album", id, u);
    if (kind === "artist" && id) return apple("artist", id, u);
    if (kind === "playlist" && id) return apple("playlist", id, u);
    return null;
  }
  return null;
}

function yt(kind: LinkKind, id: string): ParsedLink {
  const url =
    kind === "playlist"
      ? `https://www.youtube.com/playlist?list=${id}`
      : kind === "artist"
        ? `https://www.youtube.com/channel/${id}`
        : `https://www.youtube.com/watch?v=${id}`;
  return { provider: "youtube", kind, id, url };
}

function apple(kind: LinkKind, id: string, u: URL): ParsedLink {
  return { provider: "apple", kind, id, url: u.toString() };
}

export function looksLikeLink(input: string) {
  return /^(https?:\/\/|spotify:|(www\.|music\.)?(youtube\.com|youtu\.be|open\.spotify\.com|soundcloud\.com|on\.soundcloud\.com|music\.apple\.com)\/)/i.test(
    input.trim(),
  );
}
