import type { SearchType } from "../types";

const ALL: SearchType[] = ["tracks", "albums", "artists", "playlists"];

export function parseTypes(url: URL): SearchType[] {
  const raw = url.searchParams.get("types");
  if (!raw) return ALL;
  const types = raw.split(",").filter((t): t is SearchType => (ALL as string[]).includes(t));
  return types.length ? types : ALL;
}
