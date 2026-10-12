import { z } from "zod";
import { getDb } from "./db";
import { createPlaylist, upsertTracks, write } from "./library";
import type { PlaylistRecord, TrackRecord } from "./schema";
import type { ProviderId, Track } from "@/lib/types";

export const BACKUP_FORMAT = "spotube-web-backup";
export const PLAYLIST_FORMAT = "spotube-web-playlist";
export const EXPORT_VERSION = 1;

// Any service name is accepted, so backups keep songs from services parked in
// disabled-providers/ (they stay in the library and play again if restored).
const provider = z.string().min(1) as unknown as z.ZodType<ProviderId>;
const ref = z.object({ id: z.string().optional(), name: z.string() });

const trackSchema = z.object({
  key: z.string().min(3),
  provider,
  id: z.string().min(1),
  title: z.string(),
  artists: z.array(ref).default([]),
  album: ref.optional(),
  artwork: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  url: z.string().optional(),
  explicit: z.boolean().optional(),
  playbackRef: z.string().optional(),
  addedAt: z.number().optional(),
});

const playlistSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  createdAt: z.number(),
  updatedAt: z.number(),
  artwork: z.string().optional(),
  trackKeys: z.array(z.string()),
  source: z.object({ provider, id: z.string(), url: z.string().optional() }).optional(),
  pinned: z.boolean().optional(),
});

const summary = z.object({
  key: z.string(),
  provider,
  id: z.string(),
  name: z.string(),
  artists: z.array(ref).optional(),
  artwork: z.string().optional(),
  year: z.string().optional(),
  trackCount: z.number().optional(),
  followers: z.number().optional(),
  url: z.string().optional(),
  savedAt: z.number(),
});

const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().positive(),
  exportedAt: z.string(),
  data: z.object({
    tracks: z.array(trackSchema).default([]),
    playlists: z.array(playlistSchema).default([]),
    likes: z.array(z.object({ trackKey: z.string(), likedAt: z.number() })).default([]),
    albums: z.array(summary).default([]),
    artists: z.array(summary).default([]),
    collections: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          description: z.string().default(""),
          createdAt: z.number(),
          updatedAt: z.number(),
          items: z.array(
            z.object({
              type: z.enum(["playlist", "album", "artist", "track"]),
              key: z.string(),
              addedAt: z.number(),
            }),
          ),
        }),
      )
      .default([]),
    history: z
      .array(z.object({ trackKey: z.string(), provider, playedAt: z.number(), listenedMs: z.number() }))
      .default([]),
    settings: z.array(z.object({ key: z.string(), value: z.unknown() })).default([]),
  }),
});

const playlistExportSchema = z.object({
  format: z.literal(PLAYLIST_FORMAT),
  version: z.number().int().positive(),
  playlist: z.object({
    name: z.string().min(1),
    description: z.string().default(""),
    artwork: z.string().optional(),
    source: playlistSchema.shape.source,
  }),
  tracks: z.array(trackSchema),
});

export type Backup = z.infer<typeof backupSchema>;

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:${blob.type || "image/jpeg"};base64,${btoa(bin)}`;
}

export async function dataUrlToBlob(url: string): Promise<Blob> {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
  if (!m) throw new Error("Invalid image data");
  const bytes = m[2] ? Uint8Array.from(atob(m[3]), (c) => c.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(m[3]));
  return new Blob([bytes], { type: m[1] || "application/octet-stream" });
}

async function artworkOut(a: PlaylistRecord["artwork"]) {
  if (!a) return undefined;
  return typeof a === "string" ? a : blobToDataUrl(a);
}

async function artworkIn(a: string | undefined): Promise<PlaylistRecord["artwork"]> {
  if (!a) return undefined;
  return a.startsWith("data:") ? dataUrlToBlob(a) : a;
}

const stripWords = ({ words: _w, ...t }: TrackRecord) => t;

export async function exportAll(): Promise<Backup> {
  const db = getDb();
  return db.transaction("r", db.tables, async () => {
    const playlists = await db.playlists.toArray();
    return {
      format: BACKUP_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        tracks: (await db.tracks.toArray()).map(stripWords),
        playlists: await Promise.all(playlists.map(async (p) => ({ ...p, artwork: await artworkOut(p.artwork) }))),
        likes: await db.likes.toArray(),
        albums: (await db.albums.toArray()) as Backup["data"]["albums"],
        artists: (await db.artists.toArray()) as Backup["data"]["artists"],
        collections: await db.collections.toArray(),
        history: (await db.history.toArray()).map(({ id: _id, ...h }) => h),
        settings: await db.settings.toArray(),
      },
    };
  });
}

/** Builds a playlist export file from any list of tracks (e.g. Liked Songs). */
export function exportTracks(name: string, tracks: Track[], description = "") {
  return {
    format: PLAYLIST_FORMAT,
    version: EXPORT_VERSION,
    playlist: { name, description },
    tracks: tracks.map((t) => ("words" in t ? stripWords(t as TrackRecord) : t)),
  };
}

export async function exportPlaylist(id: string) {
  const db = getDb();
  const p = await db.playlists.get(id);
  if (!p) throw new Error("Playlist not found");
  const tracks = (await db.tracks.bulkGet(p.trackKeys)).filter((t): t is TrackRecord => !!t).map(stripWords);
  return {
    format: PLAYLIST_FORMAT,
    version: EXPORT_VERSION,
    playlist: { name: p.name, description: p.description, artwork: await artworkOut(p.artwork), source: p.source },
    tracks,
  };
}

export interface ImportSummary {
  kind: "backup" | "playlist";
  playlists: number;
  tracks: number;
  likes: number;
}

function formatIssues(e: z.ZodError) {
  return e.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "file"}: ${i.message}`)
    .join("; ");
}

/**
 * Imports a JSON file produced by `exportAll` or `exportPlaylist`.
 * Backups are merged by default (existing records with the same id are
 * replaced, nothing is deleted); pass `replace` to wipe the library first.
 */
export async function importJson(text: string, opts: { replace?: boolean } = {}): Promise<ImportSummary> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("This file isn't valid JSON.");
  }
  const format = (raw as { format?: string })?.format;
  if (format === PLAYLIST_FORMAT) {
    const parsed = playlistExportSchema.safeParse(raw);
    if (!parsed.success) throw new Error(`Invalid playlist file: ${formatIssues(parsed.error)}`);
    const { playlist, tracks } = parsed.data;
    await createPlaylist({
      name: playlist.name,
      description: playlist.description,
      artwork: await artworkIn(playlist.artwork),
      source: playlist.source,
      tracks: tracks as Track[],
    });
    return { kind: "playlist", playlists: 1, tracks: tracks.length, likes: 0 };
  }
  if (format !== BACKUP_FORMAT) throw new Error("Unrecognised file. Choose a Spotube Web backup or playlist export.");
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`Invalid backup: ${formatIssues(parsed.error)}`);
  const { data } = parsed.data;
  if (parsed.data.version > EXPORT_VERSION) throw new Error("This backup was made by a newer version of Spotube Web.");

  const db = getDb();
  const playlists: PlaylistRecord[] = await Promise.all(
    data.playlists.map(async (p) => ({ ...p, artwork: await artworkIn(p.artwork) })),
  );
  await write(() =>
    db.transaction("rw", db.tables, async () => {
      if (opts.replace) await Promise.all(db.tables.map((t) => t.clear()));
      await upsertTracks(data.tracks as Track[]);
      await db.playlists.bulkPut(playlists);
      await db.likes.bulkPut(data.likes);
      await db.albums.bulkPut(data.albums.map((a) => ({ ...a, artists: a.artists ?? [] })));
      await db.artists.bulkPut(data.artists);
      await db.collections.bulkPut(data.collections);
      if (data.history.length) {
        // Avoid duplicating history when the same backup is imported twice.
        const existing = new Set((await db.history.toArray()).map((h) => `${h.trackKey}@${h.playedAt}`));
        await db.history.bulkAdd(data.history.filter((h) => !existing.has(`${h.trackKey}@${h.playedAt}`)));
      }
      await db.settings.bulkPut(data.settings);
    }),
  );
  return { kind: "backup", playlists: playlists.length, tracks: data.tracks.length, likes: data.likes.length };
}

export function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const safeFilename = (s: string) => s.replace(/[^\p{L}\p{N}\-_ ]+/gu, "").trim().replace(/\s+/g, "-") || "playlist";
