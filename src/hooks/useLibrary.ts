"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getDb, useDbStatus } from "@/lib/db/db";

/** Live set of liked track keys, used for heart buttons everywhere. */
export function useLikedKeys(): Set<string> {
  const ready = useDbStatus((s) => s.status === "ready");
  return (
    useLiveQuery(async () => (ready ? new Set(await getDb().likes.toCollection().primaryKeys()) : new Set<string>()), [ready]) ??
    new Set<string>()
  );
}

export function usePlaylists() {
  const ready = useDbStatus((s) => s.status === "ready");
  return useLiveQuery(async () => (ready ? getDb().playlists.orderBy("updatedAt").reverse().toArray() : []), [ready]);
}

export function useSavedAlbumKeys(): Set<string> {
  const ready = useDbStatus((s) => s.status === "ready");
  return useLiveQuery(async () => new Set(ready ? await getDb().albums.toCollection().primaryKeys() : []), [ready]) ?? new Set();
}

export function useSavedArtistKeys(): Set<string> {
  const ready = useDbStatus((s) => s.status === "ready");
  return useLiveQuery(async () => new Set(ready ? await getDb().artists.toCollection().primaryKeys() : []), [ready]) ?? new Set();
}
