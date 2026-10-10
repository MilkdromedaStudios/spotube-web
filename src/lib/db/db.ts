import Dexie from "dexie";
import { create } from "zustand";
import { SpotubeDB } from "./schema";

export type DbStatus = "opening" | "ready" | "unavailable";

interface DbState {
  status: DbStatus;
  error?: string;
  persisted?: boolean;
}

/** Observable database status, used by the UI to explain storage problems. */
export const useDbStatus = create<DbState>(() => ({ status: "opening" }));

let instance: SpotubeDB | null = null;
let opening: Promise<SpotubeDB> | null = null;

export function getDb(): SpotubeDB {
  if (!instance) instance = new SpotubeDB();
  return instance;
}

/** Opens (and if needed creates/migrates) the database. Called once on app start. */
export function initDb(): Promise<SpotubeDB> {
  if (opening) return opening;
  opening = (async () => {
    const db = getDb();
    try {
      if (typeof indexedDB === "undefined") throw new Error("This browser does not support IndexedDB.");
      await db.open();
      useDbStatus.setState({ status: "ready", error: undefined });
      if (navigator.storage?.persisted) {
        navigator.storage
          .persisted()
          .then((persisted) => useDbStatus.setState({ persisted }))
          .catch(() => {});
      }
    } catch (e) {
      useDbStatus.setState({ status: "unavailable", error: describeStorageError(e) });
    }
    db.on("versionchange", () => {
      // Another tab upgraded the schema; close so it can proceed and reload to pick it up.
      db.close();
      if (typeof window !== "undefined") window.location.reload();
    });
    return db;
  })();
  return opening;
}

export function describeStorageError(e: unknown): string {
  const name = (e as { name?: string })?.name ?? "";
  const inner = (e as { inner?: { name?: string } })?.inner?.name ?? "";
  if (name === "QuotaExceededError" || inner === "QuotaExceededError") {
    return "Your browser's storage for this site is full. Free some space (Settings → Storage) or export and clear old data.";
  }
  if (name === "InvalidStateError" || name === "MissingAPIError" || inner === "InvalidStateError") {
    return "Your browser blocked local storage (private browsing or site data disabled). Changes will not be saved.";
  }
  if (name === "VersionError") {
    return "Stored data was created by a newer version of Spotube Web. Reload the page or clear app data.";
  }
  return (e as Error)?.message || "Local storage failed.";
}

export function isQuotaError(e: unknown) {
  return describeStorageError(e).startsWith("Your browser's storage for this site is full");
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  const granted = await navigator.storage.persist();
  useDbStatus.setState({ persisted: granted });
  return granted;
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usage, quota };
}

/** Deletes every record and recreates an empty database. */
export async function clearAllData() {
  const db = getDb();
  db.close();
  await Dexie.delete(db.name);
  instance = null;
  opening = null;
  await initDb();
}

/** Test helper: use a fresh database instance. */
export function __setDbForTests(db: SpotubeDB | null) {
  instance = db;
  opening = db ? Promise.resolve(db) : null;
  useDbStatus.setState({ status: db ? "ready" : "opening" });
}
