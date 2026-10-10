// @vitest-environment node
// Node has real, structured-cloneable Blobs (jsdom Blobs lose their data in fake-indexeddb).
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exportAll, exportPlaylist, importJson } from "./backup";
import { __setDbForTests, clearAllData, getDb } from "./db";
import {
  addToCollection,
  addTracksToPlaylist,
  createCollection,
  createPlaylist,
  deletePlaylist,
  getTracks,
  likedTracks,
  moveItem,
  recentlyPlayed,
  recordPlay,
  removeFromPlaylist,
  reorderPlaylist,
  searchLibrary,
  setLiked,
  updateListened,
  updatePlaylist,
  upsertTracks,
} from "./library";
import { applySchemaV1, SpotubeDB } from "./schema";
import { aggregate } from "./stats";
import { DEFAULT_SETTINGS, mergeSettings } from "@/lib/settings";
import type { Track } from "@/lib/types";

const t = (id: string, title = `Song ${id}`, artist = "Artist"): Track => ({
  key: `youtube:${id}`,
  provider: "youtube",
  id,
  title,
  artists: [{ name: artist }],
  durationMs: 200_000,
});

let n = 0;
let name = "";

beforeEach(async () => {
  name = `spotube-test-${++n}`;
  const db = new SpotubeDB(name);
  await db.open();
  __setDbForTests(db);
});

afterEach(async () => {
  getDb().close();
  await Dexie.delete(name);
});

/** Simulates a page refresh / browser restart: close the connection and open a new one. */
async function reopen() {
  getDb().close();
  const db = new SpotubeDB(name);
  await db.open();
  __setDbForTests(db);
  return db;
}

describe("playlists", () => {
  it("creates, renames, reorders, removes and deletes, persisting across reopen", async () => {
    const p = await createPlaylist({ name: "Road trip", tracks: [t("a"), t("b"), t("c")] });
    expect(p.trackKeys).toEqual(["youtube:a", "youtube:b", "youtube:c"]);

    await updatePlaylist(p.id, { name: "Road trip 2026", description: "Summer" });
    await reorderPlaylist(p.id, 0, 2);
    await removeFromPlaylist(p.id, "youtube:b");

    const db = await reopen();
    const saved = await db.playlists.get(p.id);
    expect(saved).toMatchObject({ name: "Road trip 2026", description: "Summer", trackKeys: ["youtube:c", "youtube:a"] });
    expect((await getTracks(saved!.trackKeys)).map((x) => x.title)).toEqual(["Song c", "Song a"]);

    await deletePlaylist(p.id);
    expect(await db.playlists.get(p.id)).toBeUndefined();
  });

  it("prevents duplicate tracks and rejects empty names", async () => {
    const p = await createPlaylist({ tracks: [t("a"), t("a")] });
    expect(p.name).toBe("My Playlist #1");
    expect(p.trackKeys).toEqual(["youtube:a"]);
    expect(await addTracksToPlaylist(p.id, [t("a"), t("b"), t("b")])).toEqual({ added: 1, skipped: 1 });
    await expect(updatePlaylist(p.id, { name: "  " })).rejects.toThrow();
  });

  it("stores cover images as blobs", async () => {
    const p = await createPlaylist({ name: "Cover" });
    await updatePlaylist(p.id, { artwork: new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }) });
    const db = await reopen();
    const saved = await db.playlists.get(p.id);
    expect(saved?.artwork).toBeInstanceOf(Blob);
  });

  it("moveItem handles bounds", () => {
    expect(moveItem([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
    expect(moveItem([1, 2, 3], 5, 0)).toEqual([1, 2, 3]);
  });
});

describe("library", () => {
  it("likes survive a restart and are not duplicated", async () => {
    await setLiked(t("a"), true);
    await setLiked(t("a"), true);
    await setLiked(t("b"), true);
    await reopen();
    expect((await likedTracks()).map((x) => x.id).sort()).toEqual(["a", "b"]);
    await setLiked(t("a"), false);
    expect((await likedTracks()).map((x) => x.id)).toEqual(["b"]);
  });

  it("keeps original addedAt and learns metadata on upsert", async () => {
    await upsertTracks([t("a")]);
    const first = (await getDb().tracks.get("youtube:a"))!.addedAt;
    await new Promise((r) => setTimeout(r, 5));
    await upsertTracks([{ ...t("a"), artwork: "x.jpg" }]);
    const rec = (await getDb().tracks.get("youtube:a"))!;
    expect(rec.addedAt).toBe(first);
    expect(rec.artwork).toBe("x.jpg");
  });

  it("searches saved tracks through the word index", async () => {
    await upsertTracks([t("a", "Bohemian Rhapsody", "Queen"), t("b", "Under Pressure", "Queen & David Bowie"), t("c", "Héroes", "David Bowie")]);
    expect((await searchLibrary("queen")).map((x) => x.id).sort()).toEqual(["a", "b"]);
    expect((await searchLibrary("bow pres")).map((x) => x.id)).toEqual(["b"]);
    expect((await searchLibrary("heroes")).map((x) => x.id)).toEqual(["c"]);
    expect(await searchLibrary("   ")).toEqual([]);
  });

  it("collections dedupe items", async () => {
    const c = await createCollection("Chill");
    expect(await addToCollection(c.id, "track", "youtube:a", { track: t("a") })).toBe(true);
    expect(await addToCollection(c.id, "track", "youtube:a")).toBe(false);
    expect((await getDb().collections.get(c.id))!.items).toHaveLength(1);
  });

  it("records history and computes stats", async () => {
    const id = await recordPlay(t("a"));
    await updateListened(id!, 60_000);
    await recordPlay(t("b"));
    await recordPlay(t("a"));
    const recent = await recentlyPlayed(10);
    expect(recent.map((x) => x.id)).toEqual(["a", "b"]);
    const rows = await getDb().history.toArray();
    const tracks = new Map((await getDb().tracks.toArray()).map((x) => [x.key, x]));
    const s = aggregate(rows, tracks, 7);
    expect(s.plays).toBe(3);
    expect(s.listenedMs).toBe(60_000);
    expect(s.topTracks[0]).toMatchObject({ plays: 2 });
    expect(s.topArtists[0]).toEqual({ name: "Artist", plays: 3 });
    expect(s.daily).toHaveLength(7);
    expect(s.daily[6].plays).toBe(3);
  });
});

describe("schema migration", () => {
  it("upgrades a v1 database to v2 and backfills the search index", async () => {
    getDb().close();
    await Dexie.delete(name);
    const v1 = new Dexie(name);
    applySchemaV1(v1);
    await v1.open();
    await v1.table("tracks").put({ key: "youtube:z", provider: "youtube", id: "z", title: "Old Song", artists: [{ name: "Legacy Band" }], addedAt: 1 });
    await v1.table("playlists").put({ id: "p1", name: "Old", createdAt: 1, updatedAt: 1, trackKeys: ["youtube:z"] });
    expect(v1.verno).toBe(1);
    v1.close();

    const db = new SpotubeDB(name);
    await db.open();
    __setDbForTests(db);
    expect(db.verno).toBe(2);
    expect((await db.tracks.get("youtube:z"))!.words).toEqual(["old", "song", "legacy", "band"]);
    expect((await db.playlists.get("p1"))!.description).toBe("");
    expect((await searchLibrary("legacy")).map((x) => x.id)).toEqual(["z"]);
    expect(await db.collections.count()).toBe(0);
  });
});

describe("backup", () => {
  it("round-trips a full export into an empty database", async () => {
    const p = await createPlaylist({ name: "Mix", tracks: [t("a"), t("b")], artwork: new Blob([new Uint8Array([9])], { type: "image/png" }) });
    await setLiked(t("c"), true);
    await getDb().settings.put({ key: "theme", value: "light" });
    const backup = await exportAll();
    const json = JSON.stringify(backup);
    expect(json).toContain("data:image/png;base64,CQ==");

    await clearAllData();
    __setDbForTests(getDb());
    expect(await getDb().playlists.count()).toBe(0);

    const r = await importJson(json);
    expect(r).toMatchObject({ kind: "backup", playlists: 1, likes: 1 });
    const restored = await getDb().playlists.get(p.id);
    expect(restored?.trackKeys).toEqual(["youtube:a", "youtube:b"]);
    expect(restored?.artwork).toBeInstanceOf(Blob);
    expect((await getDb().settings.get("theme"))?.value).toBe("light");

    // Importing again merges without duplicating likes or history.
    await importJson(json);
    expect(await getDb().likes.count()).toBe(1);
  });

  it("imports a single playlist export as a new playlist", async () => {
    const p = await createPlaylist({ name: "Share me", tracks: [t("a")] });
    const file = JSON.stringify(await exportPlaylist(p.id));
    await importJson(file);
    const all = await getDb().playlists.toArray();
    expect(all).toHaveLength(2);
    expect(all.filter((x) => x.name === "Share me")).toHaveLength(2);
  });

  it("rejects invalid files with a readable message", async () => {
    await expect(importJson("not json")).rejects.toThrow("isn't valid JSON");
    await expect(importJson(JSON.stringify({ format: "other" }))).rejects.toThrow("Unrecognised file");
    await expect(importJson(JSON.stringify({ format: "spotube-web-backup", version: 1, exportedAt: "x", data: { playlists: [{ id: 1 }] } }))).rejects.toThrow(
      /Invalid backup/,
    );
  });

  it("replace mode wipes existing data first", async () => {
    await createPlaylist({ name: "Keep?" });
    const empty = { format: "spotube-web-backup", version: 1, exportedAt: new Date().toISOString(), data: {} };
    await importJson(JSON.stringify(empty), { replace: true });
    expect(await getDb().playlists.count()).toBe(0);
  });
});

describe("settings", () => {
  it("merges stored values with defaults and ignores bad types", () => {
    const s = mergeSettings({ theme: "light", volume: 3, accent: "nope", enabledProviders: { youtube: false } } as never);
    expect(s.theme).toBe("light");
    expect(s.accent).toBe(DEFAULT_SETTINGS.accent);
    expect(s.enabledProviders).toEqual({ ...DEFAULT_SETTINGS.enabledProviders, youtube: false });
  });
});
