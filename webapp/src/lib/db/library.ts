import Dexie from "dexie";
import { getDb, describeStorageError, useDbStatus } from "./db";
import {
  wordsFor,
  type CollectionItemType,
  type CollectionRecord,
  type PlaylistRecord,
  type TrackRecord,
} from "./schema";
import type { AlbumSummary, ArtistSummary, Track } from "@/lib/types";
import { toast } from "@/lib/toast";

/** Runs a database write, reporting storage failures to the user. */
export async function write<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    // Nested inside another write: let the outermost call report it once.
    if (Dexie.currentTransaction) throw e;
    const message = describeStorageError(e);
    toast.error(`Couldn't save: ${message}`);
    if (/blocked local storage|not support IndexedDB/.test(message)) {
      useDbStatus.setState({ status: "unavailable", error: message });
    }
    throw e;
  }
}

const now = () => Date.now();
const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function toRecord(t: Track, addedAt: number): TrackRecord {
  // Strip unknown/transient fields so only the documented shape is stored.
  const rec: TrackRecord = {
    key: t.key,
    provider: t.provider,
    id: t.id,
    title: t.title,
    artists: t.artists.map((a) => ({ id: a.id, name: a.name })),
    album: t.album ? { id: t.album.id, name: t.album.name } : undefined,
    artwork: t.artwork,
    durationMs: t.durationMs,
    url: t.url,
    explicit: t.explicit,
    playbackRef: t.playbackRef,
    addedAt,
    words: wordsFor(t),
  };
  return rec;
}

/** Inserts or refreshes track metadata, keeping the original `addedAt`. */
export async function upsertTracks(tracks: Track[]): Promise<void> {
  if (!tracks.length) return;
  const db = getDb();
  const unique = Array.from(new Map(tracks.map((t) => [t.key, t])).values());
  await write(() =>
    db.transaction("rw", db.tracks, async () => {
      const existing = await db.tracks.bulkGet(unique.map((t) => t.key));
      const ts = now();
      await db.tracks.bulkPut(
        unique.map((t, i) => {
          const prev = existing[i];
          const merged: Track = prev
            ? { ...prev, ...t, durationMs: t.durationMs ?? prev.durationMs, artwork: t.artwork ?? prev.artwork }
            : t;
          return toRecord(merged, prev?.addedAt ?? ts);
        }),
      );
    }),
  );
}

/** Updates a stored track's duration once a player reports it. */
export async function learnDuration(key: string, durationMs: number) {
  const db = getDb();
  const t = await db.tracks.get(key);
  if (t && (!t.durationMs || Math.abs(t.durationMs - durationMs) > 2000)) {
    await db.tracks.update(key, { durationMs });
  }
}

/** Returns tracks for the given keys in the same order, skipping missing ones. */
export async function getTracks(keys: string[]): Promise<TrackRecord[]> {
  const rows = await getDb().tracks.bulkGet(keys);
  return rows.filter((r): r is TrackRecord => !!r);
}

// ---------------------------------------------------------------- playlists

export async function createPlaylist(input: {
  name?: string;
  description?: string;
  tracks?: Track[];
  artwork?: Blob | string;
  source?: PlaylistRecord["source"];
}): Promise<PlaylistRecord> {
  const db = getDb();
  const count = await db.playlists.count();
  const ts = now();
  const tracks = dedupe(input.tracks ?? []);
  const record: PlaylistRecord = {
    id: uuid(),
    name: input.name?.trim() || `My Playlist #${count + 1}`,
    description: input.description?.trim() ?? "",
    createdAt: ts,
    updatedAt: ts,
    artwork: input.artwork,
    trackKeys: tracks.map((t) => t.key),
    source: input.source,
  };
  await write(() =>
    db.transaction("rw", db.playlists, db.tracks, async () => {
      await upsertTracks(tracks);
      await db.playlists.add(record);
    }),
  );
  return record;
}

export async function updatePlaylist(
  id: string,
  patch: Partial<Pick<PlaylistRecord, "name" | "description" | "artwork" | "pinned">>,
) {
  if (patch.name !== undefined && !patch.name.trim()) throw new Error("Playlist name can't be empty");
  await write(() =>
    getDb().playlists.update(id, {
      ...patch,
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      updatedAt: now(),
    }),
  );
}

export async function deletePlaylist(id: string) {
  const db = getDb();
  await write(() =>
    db.transaction("rw", db.playlists, db.collections, async () => {
      await db.playlists.delete(id);
      await db.collections.toCollection().modify((c) => {
        c.items = c.items.filter((i) => !(i.type === "playlist" && i.key === id));
      });
    }),
  );
}

/** Appends tracks, skipping ones already in the playlist. */
export async function addTracksToPlaylist(id: string, tracks: Track[]) {
  const db = getDb();
  let added = 0;
  let skipped = 0;
  await write(() =>
    db.transaction("rw", db.playlists, db.tracks, async () => {
      const p = await db.playlists.get(id);
      if (!p) throw new Error("Playlist not found");
      const existing = new Set(p.trackKeys);
      const fresh = dedupe(tracks).filter((t) => {
        if (existing.has(t.key)) {
          skipped++;
          return false;
        }
        return true;
      });
      added = fresh.length;
      await upsertTracks(fresh);
      await db.playlists.update(id, {
        trackKeys: [...p.trackKeys, ...fresh.map((t) => t.key)],
        updatedAt: now(),
      });
    }),
  );
  return { added, skipped };
}

export async function removeFromPlaylist(id: string, trackKey: string) {
  const db = getDb();
  await write(() =>
    db.transaction("rw", db.playlists, async () => {
      const p = await db.playlists.get(id);
      if (!p) return;
      await db.playlists.update(id, { trackKeys: p.trackKeys.filter((k) => k !== trackKey), updatedAt: now() });
    }),
  );
}

export async function reorderPlaylist(id: string, from: number, to: number) {
  const db = getDb();
  await write(() =>
    db.transaction("rw", db.playlists, async () => {
      const p = await db.playlists.get(id);
      if (!p) return;
      await db.playlists.update(id, { trackKeys: moveItem(p.trackKeys, from, to), updatedAt: now() });
    }),
  );
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const copy = list.slice();
  if (from < 0 || from >= copy.length || to < 0 || to >= copy.length) return copy;
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

function dedupe(tracks: Track[]) {
  return Array.from(new Map(tracks.map((t) => [t.key, t])).values());
}

// -------------------------------------------------------------------- likes

export async function setLiked(track: Track, liked: boolean) {
  const db = getDb();
  await write(() =>
    db.transaction("rw", db.likes, db.tracks, async () => {
      if (liked) {
        await upsertTracks([track]);
        if (!(await db.likes.get(track.key))) await db.likes.put({ trackKey: track.key, likedAt: now() });
      } else {
        await db.likes.delete(track.key);
      }
    }),
  );
}

export async function likedTracks(offset = 0, limit = 200): Promise<TrackRecord[]> {
  const likes = await getDb().likes.orderBy("likedAt").reverse().offset(offset).limit(limit).toArray();
  return getTracks(likes.map((l) => l.trackKey));
}

// ----------------------------------------------------------- albums/artists

export async function setAlbumSaved(album: AlbumSummary, saved: boolean) {
  const db = getDb();
  await write(async () => {
    if (saved) {
      if (!(await db.albums.get(album.key))) await db.albums.put({ ...album, savedAt: now() });
    } else await db.albums.delete(album.key);
  });
}

export async function setArtistSaved(artist: ArtistSummary, saved: boolean) {
  const db = getDb();
  await write(async () => {
    if (saved) {
      if (!(await db.artists.get(artist.key))) await db.artists.put({ ...artist, savedAt: now() });
    } else await db.artists.delete(artist.key);
  });
}

// -------------------------------------------------------------- collections

export async function createCollection(name: string, description = ""): Promise<CollectionRecord> {
  const ts = now();
  const rec: CollectionRecord = {
    id: uuid(),
    name: name.trim() || "New collection",
    description,
    createdAt: ts,
    updatedAt: ts,
    items: [],
  };
  await write(() => getDb().collections.add(rec));
  return rec;
}

export async function renameCollection(id: string, name: string) {
  if (!name.trim()) throw new Error("Collection name can't be empty");
  await write(() => getDb().collections.update(id, { name: name.trim(), updatedAt: now() }));
}

export async function deleteCollection(id: string) {
  await write(() => getDb().collections.delete(id));
}

/** Adds an item to a collection; returns false when it was already there. */
export async function addToCollection(
  id: string,
  type: CollectionItemType,
  key: string,
  payload?: { track?: Track; album?: AlbumSummary; artist?: ArtistSummary },
): Promise<boolean> {
  const db = getDb();
  let added = false;
  await write(() =>
    db.transaction("rw", [db.collections, db.tracks, db.albums, db.artists], async () => {
      const c = await db.collections.get(id);
      if (!c) throw new Error("Collection not found");
      if (c.items.some((i) => i.type === type && i.key === key)) return;
      // Make sure the referenced entity is stored locally so the collection survives offline.
      if (payload?.track) await upsertTracks([payload.track]);
      if (payload?.album && !(await db.albums.get(payload.album.key)))
        await db.albums.put({ ...payload.album, savedAt: now() });
      if (payload?.artist && !(await db.artists.get(payload.artist.key)))
        await db.artists.put({ ...payload.artist, savedAt: now() });
      added = true;
      await db.collections.update(id, { items: [...c.items, { type, key, addedAt: now() }], updatedAt: now() });
    }),
  );
  return added;
}

export async function removeFromCollection(id: string, type: CollectionItemType, key: string) {
  const db = getDb();
  await write(() =>
    db.transaction("rw", db.collections, async () => {
      const c = await db.collections.get(id);
      if (!c) return;
      await db.collections.update(id, {
        items: c.items.filter((i) => !(i.type === type && i.key === key)),
        updatedAt: now(),
      });
    }),
  );
}

// ------------------------------------------------------------------ history

export async function recordPlay(track: Track): Promise<number | undefined> {
  const db = getDb();
  try {
    return await db.transaction("rw", db.history, db.tracks, async () => {
      await upsertTracks([track]);
      return db.history.add({ trackKey: track.key, provider: track.provider, playedAt: now(), listenedMs: 0 });
    });
  } catch {
    return undefined; // history is best effort; never interrupt playback
  }
}

export async function updateListened(historyId: number, listenedMs: number) {
  try {
    await getDb().history.update(historyId, { listenedMs: Math.round(listenedMs) });
  } catch {
    /* best effort */
  }
}

/** Most recently played distinct tracks. Iterates the index lazily. */
export async function recentlyPlayed(limit = 20): Promise<(TrackRecord & { playedAt: number })[]> {
  const db = getDb();
  const seen = new Map<string, number>();
  await db.history
    .orderBy("playedAt")
    .reverse()
    .until(() => seen.size >= limit)
    .each((h) => {
      if (!seen.has(h.trackKey)) seen.set(h.trackKey, h.playedAt);
    });
  const tracks = await getTracks([...seen.keys()]);
  return tracks.map((t) => ({ ...t, playedAt: seen.get(t.key)! }));
}

export async function clearHistory() {
  const db = getDb();
  await write(() => db.transaction("rw", db.history, db.resume, async () => {
    await db.history.clear();
    await db.resume.clear();
  }));
}

// ------------------------------------------------------------------- resume

export async function getResume(key: string) {
  return getDb().resume.get(key);
}

export async function saveResume(key: string, positionMs: number) {
  try {
    await getDb().resume.put({ trackKey: key, positionMs: Math.round(positionMs), updatedAt: now() });
  } catch {
    /* best effort */
  }
}

export async function clearResume(key: string) {
  try {
    await getDb().resume.delete(key);
  } catch {
    /* best effort */
  }
}

// ------------------------------------------------------------ local search

/** Searches saved tracks using the multi-entry `words` index (prefix match on every word). */
export async function searchLibrary(query: string, limit = 50): Promise<TrackRecord[]> {
  const words = wordsFor({ title: query, artists: [] });
  if (!words.length) return [];
  const [first, ...rest] = words.sort((a, b) => b.length - a.length);
  const results: TrackRecord[] = [];
  await getDb()
    .tracks.where("words")
    .startsWith(first)
    .distinct()
    .until(() => results.length >= limit)
    .each((t) => {
      if (rest.every((w) => t.words.some((tw) => tw.startsWith(w)))) results.push(t);
    });
  return results;
}
