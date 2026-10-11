import Dexie, { type EntityTable } from "dexie";
import type { AlbumSummary, ArtistSummary, ProviderId, Track } from "@/lib/types";

export const DB_NAME = "spotube-web";

export interface TrackRecord extends Track {
  addedAt: number;
  /** Lower-cased words of title/artists/album; multi-entry index for search (schema v2+) */
  words: string[];
}

export interface PlaylistRecord {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  /** Uploaded cover (Blob) or remote artwork URL */
  artwork?: Blob | string;
  /** Ordered track keys (`provider:id`) referencing the `tracks` store */
  trackKeys: string[];
  /** Set when the playlist was copied from a provider playlist */
  source?: { provider: ProviderId; id: string; url?: string };
  pinned?: boolean;
}

export interface LikeRecord {
  trackKey: string;
  likedAt: number;
}

export interface SavedAlbumRecord extends AlbumSummary {
  savedAt: number;
}

export interface SavedArtistRecord extends ArtistSummary {
  savedAt: number;
}

export type CollectionItemType = "playlist" | "album" | "artist" | "track";

export interface CollectionRecord {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  items: { type: CollectionItemType; key: string; addedAt: number }[];
}

export interface HistoryRecord {
  id?: number;
  trackKey: string;
  provider: ProviderId;
  playedAt: number;
  /** Milliseconds actually listened (updated when the track stops) */
  listenedMs: number;
}

export interface ResumeRecord {
  trackKey: string;
  positionMs: number;
  updatedAt: number;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

export type RepeatMode = "off" | "all" | "one";

export interface PlayerStateRecord {
  id: "current";
  queueKeys: string[];
  /** Queue order before shuffle was enabled */
  originalKeys: string[] | null;
  index: number;
  positionMs: number;
  volume: number;
  muted: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
  updatedAt: number;
}

export function wordsFor(t: Pick<Track, "title" | "artists" | "album">): string[] {
  const text = [t.title, ...t.artists.map((a) => a.name), t.album?.name ?? ""].join(" ");
  const words = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return Array.from(new Set(words));
}

/**
 * Versioned schema. Never edit an existing version; add a new one with an
 * `upgrade()` migration instead.
 */
export class SpotubeDB extends Dexie {
  tracks!: EntityTable<TrackRecord, "key">;
  playlists!: EntityTable<PlaylistRecord, "id">;
  likes!: EntityTable<LikeRecord, "trackKey">;
  albums!: EntityTable<SavedAlbumRecord, "key">;
  artists!: EntityTable<SavedArtistRecord, "key">;
  collections!: EntityTable<CollectionRecord, "id">;
  history!: EntityTable<HistoryRecord, "id">;
  resume!: EntityTable<ResumeRecord, "trackKey">;
  settings!: EntityTable<SettingRecord, "key">;
  player!: EntityTable<PlayerStateRecord, "id">;

  constructor(name = DB_NAME) {
    super(name);
    applySchemaV1(this);
    applySchemaV2(this);
  }
}

export function applySchemaV1(db: Dexie) {
  db.version(1).stores({
    tracks: "&key, provider, title, addedAt",
    playlists: "&id, name, createdAt, updatedAt",
    likes: "&trackKey, likedAt",
    albums: "&key, provider, name, savedAt",
    artists: "&key, provider, name, savedAt",
    history: "++id, trackKey, playedAt, provider",
    settings: "&key",
    player: "&id",
  });
}

/**
 * v2: full-text word index on tracks, custom collections and per-track resume
 * positions. Backfills the `words` index for tracks stored by v1.
 */
export function applySchemaV2(db: Dexie) {
  db.version(2)
    .stores({
      tracks: "&key, provider, title, addedAt, *words",
      collections: "&id, name, updatedAt",
      resume: "&trackKey, updatedAt",
      history: "++id, trackKey, playedAt, provider, [trackKey+playedAt]",
    })
    .upgrade(async (tx) => {
      await tx
        .table("tracks")
        .toCollection()
        .modify((t: TrackRecord) => {
          t.words = wordsFor({ title: t.title ?? "", artists: t.artists ?? [], album: t.album });
        });
      await tx
        .table("playlists")
        .toCollection()
        .modify((p: PlaylistRecord) => {
          p.description ??= "";
          p.trackKeys ??= [];
        });
    });
}
