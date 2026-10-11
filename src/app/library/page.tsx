"use client";

import clsx from "clsx";
import { useLiveQuery } from "dexie-react-hooks";
import { Clock, Disc3, FolderOpen, Heart, ListMusic, Mic2, Plus, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { AlbumCard, ArtistCard, CardGrid, MediaCard } from "@/components/Cards";
import { Page } from "@/components/Page";
import { useCreatePlaylist } from "@/components/shell/Sidebar";
import { TrackList } from "@/components/TrackList";
import { Button, Dialog, EmptyState, LoadingState } from "@/components/ui";
import { usePlaylists } from "@/hooks/useLibrary";
import { importJson } from "@/lib/db/backup";
import { getDb, useDbStatus } from "@/lib/db/db";
import { clearHistory, createCollection, getTracks } from "@/lib/db/library";
import { playTracks } from "@/lib/player/engine";
import { toast } from "@/lib/toast";
import type { Track } from "@/lib/types";
import { collectionPath, playlistPath } from "@/lib/paths";

const TABS = [
  { id: "playlists", label: "Playlists", icon: ListMusic },
  { id: "albums", label: "Albums", icon: Disc3 },
  { id: "artists", label: "Artists", icon: Mic2 },
  { id: "collections", label: "Collections", icon: FolderOpen },
  { id: "history", label: "Recently played", icon: Clock },
] as const;
type Tab = (typeof TABS)[number]["id"];

function Playlists() {
  const playlists = usePlaylists();
  const likedCount = useLiveQuery(() => getDb().likes.count(), []);
  if (!playlists) return <LoadingState />;
  return (
    <CardGrid>
      <MediaCard href="/liked" title="Liked Songs" subtitle={`${likedCount ?? 0} songs`} kind="liked" />
      {playlists.map((p) => (
        <MediaCard
          key={p.id}
          href={playlistPath(p.id)}
          title={p.name}
          subtitle={`${p.trackKeys.length} tracks`}
          artwork={p.artwork}
          kind="playlist"
          onPlay={async () => {
            const tracks = await getTracks(p.trackKeys);
            if (!tracks.length) throw new Error("This playlist is empty.");
            await playTracks(tracks, 0);
          }}
        />
      ))}
    </CardGrid>
  );
}

function Albums() {
  const albums = useLiveQuery(() => getDb().albums.orderBy("savedAt").reverse().toArray(), []);
  if (!albums) return <LoadingState />;
  if (!albums.length)
    return <EmptyState icon={<Disc3 className="size-8" />} title="No saved albums">Open an album and tap the heart to save it here.</EmptyState>;
  return (
    <CardGrid>
      {albums.map((a) => (
        <AlbumCard key={a.key} album={a} />
      ))}
    </CardGrid>
  );
}

function Artists() {
  const artists = useLiveQuery(() => getDb().artists.orderBy("savedAt").reverse().toArray(), []);
  if (!artists) return <LoadingState />;
  if (!artists.length)
    return <EmptyState icon={<Mic2 className="size-8" />} title="No favorite artists">Follow artists from their page to keep them here.</EmptyState>;
  return (
    <CardGrid>
      {artists.map((a) => (
        <ArtistCard key={a.key} artist={a} />
      ))}
    </CardGrid>
  );
}

function Collections() {
  const collections = useLiveQuery(() => getDb().collections.orderBy("updatedAt").reverse().toArray(), []);
  const [name, setName] = useState("");
  const router = useRouter();
  if (!collections) return <LoadingState />;
  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex max-w-md gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const c = await createCollection(name).catch(() => null);
          if (c) router.push(collectionPath(c.id));
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New collection name"
          aria-label="New collection name"
          className="h-10 flex-1 rounded-full border border-line bg-surface-2 px-4 text-sm outline-none focus:border-accent"
        />
        <Button type="submit" variant="primary">
          <Plus className="size-4" /> Create
        </Button>
      </form>
      {collections.length ? (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((c) => (
            <li key={c.id}>
              <Link href={collectionPath(c.id)} className="flex items-center gap-3 rounded-xl border border-line p-4 hover:bg-surface-2">
                <FolderOpen className="size-6 text-accent" />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{c.name}</span>
                  <span className="text-sm text-muted">{c.items.length} items</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<FolderOpen className="size-8" />} title="No collections yet">
          Collections are folders for any mix of playlists, albums, artists and songs. Use “Add to collection” from their menus.
        </EmptyState>
      )}
    </div>
  );
}

const PAGE = 100;

function History() {
  const [limit, setLimit] = useState(PAGE);
  const [confirm, setConfirm] = useState(false);
  const data = useLiveQuery(async () => {
    const db = getDb();
    const rows = await db.history.orderBy("playedAt").reverse().limit(limit).toArray();
    const tracks = await db.tracks.bulkGet(rows.map((r) => r.trackKey));
    const total = await db.history.count();
    return { rows: rows.map((r, i) => ({ r, t: tracks[i] })).filter((x): x is { r: typeof x.r; t: Track & { addedAt: number; words: string[] } } => !!x.t), total };
  }, [limit]);
  if (!data) return <LoadingState />;
  if (!data.rows.length)
    return <EmptyState icon={<Clock className="size-8" />} title="Nothing played yet">Your listening history stays in this browser. You can turn it off in Settings → Privacy.</EmptyState>;
  const tracks = data.rows.map((x) => ({ ...x.t, key: x.t.key }));
  // A track can appear many times in history; the track list needs unique rows.
  const unique = Array.from(new Map(tracks.map((t) => [t.key, t])).values());
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {data.total} play{data.total === 1 ? "" : "s"} recorded · showing {unique.length} most recent songs
        </p>
        <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
          Clear history
        </Button>
      </div>
      <TrackList tracks={unique} />
      {data.rows.length < data.total && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setLimit((l) => l + PAGE)}>
            Show more
          </Button>
        </div>
      )}
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Clear listening history?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await clearHistory();
                setConfirm(false);
                toast.success("History cleared");
              }}
            >
              Clear
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">This removes recently played tracks, listening statistics and resume positions from this browser.</p>
      </Dialog>
    </div>
  );
}

function LibraryInner() {
  const params = useSearchParams();
  const router = useRouter();
  const ready = useDbStatus((s) => s.status === "ready");
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "playlists") as Tab;
  const create = useCreatePlaylist();
  const file = useRef<HTMLInputElement>(null);
  return (
    <Page
      title="Your Library"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push("/import")}>
            <Upload className="size-4" /> Import from music services
          </Button>
          <Button variant="outline" size="sm" onClick={() => file.current?.click()}>
            <Upload className="size-4" /> Import JSON
          </Button>
          <Button variant="primary" size="sm" onClick={create}>
            <Plus className="size-4" /> New playlist
          </Button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                const r = await importJson(await f.text());
                toast.success(r.kind === "playlist" ? `Imported playlist with ${r.tracks} tracks` : `Imported ${r.playlists} playlists and ${r.tracks} tracks`);
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
          />
        </div>
      }
    >
      <div className="scrollbar-thin -mx-1 flex gap-2 overflow-x-auto px-1" role="tablist">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => router.replace(`/library?tab=${id}`, { scroll: false })}
            className={clsx(
              "flex shrink-0 items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium",
              tab === id ? "bg-fg text-bg" : "bg-surface-2 hover:bg-surface-3",
            )}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
        <Link href="/liked" className="flex shrink-0 items-center gap-2 rounded-full bg-surface-2 px-4 py-1.5 text-sm font-medium hover:bg-surface-3">
          <Heart className="size-4" /> Liked Songs
        </Link>
      </div>
      {!ready ? (
        <LoadingState />
      ) : tab === "playlists" ? (
        <Playlists />
      ) : tab === "albums" ? (
        <Albums />
      ) : tab === "artists" ? (
        <Artists />
      ) : tab === "collections" ? (
        <Collections />
      ) : (
        <History />
      )}
    </Page>
  );
}

export default function LibraryPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <LibraryInner />
    </Suspense>
  );
}
