import type { ProviderId } from "./types";

/**
 * Links to item pages. The site is a static export, so the item is passed in
 * the query string rather than as a path segment.
 */
export const playlistPath = (id: string) => `/playlist?id=${encodeURIComponent(id)}`;

export const collectionPath = (id: string) => `/collection?id=${encodeURIComponent(id)}`;

export function pathFor(kind: "album" | "artist" | "playlist", provider: ProviderId, id: string) {
  const page = kind === "playlist" ? "browse-playlist" : kind;
  return `/${page}?provider=${provider}&id=${encodeURIComponent(id)}`;
}
