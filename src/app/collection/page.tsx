"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { FolderOpen, MoreHorizontal, Pencil, Trash2, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AlbumCard, ArtistCard, CardGrid, MediaCard, Section } from "@/components/Cards";
import { Page } from "@/components/Page";
import { TrackList } from "@/components/TrackList";
import { Button, Dialog, EmptyState, LoadingState, Menu } from "@/components/ui";
import { getDb, useDbStatus } from "@/lib/db/db";
import { deleteCollection, getTracks, removeFromCollection, renameCollection } from "@/lib/db/library";
import type { PlaylistRecord, SavedAlbumRecord, SavedArtistRecord } from "@/lib/db/schema";
import { playTracks } from "@/lib/player/engine";
import { toast } from "@/lib/toast";
import { playlistPath } from "@/lib/paths";

function CollectionView({ id }: { id: string }) {
  const router = useRouter();
  const ready = useDbStatus((s) => s.status === "ready");
  const data = useLiveQuery(async () => {
    if (!ready) return undefined;
    const db = getDb();
    const c = await db.collections.get(id);
    if (!c) return null;
    const keys = (t: string) => c.items.filter((i) => i.type === t).map((i) => i.key);
    const [playlists, albums, artists, tracks] = await Promise.all([
      db.playlists.bulkGet(keys("playlist")),
      db.albums.bulkGet(keys("album")),
      db.artists.bulkGet(keys("artist")),
      getTracks(keys("track")),
    ]);
    return {
      c,
      playlists: playlists.filter((x): x is PlaylistRecord => !!x),
      albums: albums.filter((x): x is SavedAlbumRecord => !!x),
      artists: artists.filter((x): x is SavedArtistRecord => !!x),
      tracks,
    };
  }, [id, ready]);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");

  if (data === undefined) return <Page><LoadingState /></Page>;
  if (data === null)
    return (
      <Page>
        <EmptyState icon={<FolderOpen className="size-8" />} title="Collection not found" />
      </Page>
    );
  const { c, playlists, albums, artists, tracks } = data;
  return (
    <Page
      title={c.name}
      actions={
        <Menu
          label="Collection options"
          trigger={<MoreHorizontal className="size-5" />}
          items={[
            { label: "Rename", icon: <Pencil />, onSelect: () => (setName(c.name), setRenaming(true)) },
            {
              label: "Delete collection",
              icon: <Trash2 />,
              danger: true,
              onSelect: async () => {
                await deleteCollection(c.id);
                toast.success("Collection deleted (its items are kept)");
                router.push("/library?tab=collections");
              },
            },
          ]}
        />
      }
    >
      {!c.items.length && (
        <EmptyState icon={<FolderOpen className="size-8" />} title="This collection is empty">
          Use “Add to collection” on a song, album, artist or playlist.
        </EmptyState>
      )}
      {playlists.length > 0 && (
        <Section title="Playlists">
          <CardGrid>
            {playlists.map((p) => (
              <div key={p.id} className="relative">
                <MediaCard
                  href={playlistPath(p.id)}
                  title={p.name}
                  subtitle={`${p.trackKeys.length} tracks`}
                  artwork={p.artwork}
                  kind="playlist"
                  onPlay={async () => playTracks(await getTracks(p.trackKeys), 0)}
                />
                <RemoveChip onClick={() => removeFromCollection(c.id, "playlist", p.id)} />
              </div>
            ))}
          </CardGrid>
        </Section>
      )}
      {albums.length > 0 && (
        <Section title="Albums">
          <CardGrid>
            {albums.map((a) => (
              <div key={a.key} className="relative">
                <AlbumCard album={a} />
                <RemoveChip onClick={() => removeFromCollection(c.id, "album", a.key)} />
              </div>
            ))}
          </CardGrid>
        </Section>
      )}
      {artists.length > 0 && (
        <Section title="Artists">
          <CardGrid>
            {artists.map((a) => (
              <div key={a.key} className="relative">
                <ArtistCard artist={a} />
                <RemoveChip onClick={() => removeFromCollection(c.id, "artist", a.key)} />
              </div>
            ))}
          </CardGrid>
        </Section>
      )}
      {tracks.length > 0 && (
        <Section title="Songs">
          <TrackList tracks={tracks} onRemove={(t) => void removeFromCollection(c.id, "track", t.key)} removeLabel="Remove from collection" />
        </Section>
      )}
      <Dialog
        open={renaming}
        onClose={() => setRenaming(false)}
        title="Rename collection"
        footer={
          <Button
            variant="primary"
            disabled={!name.trim()}
            onClick={async () => {
              await renameCollection(c.id, name);
              setRenaming(false);
            }}
          >
            Save
          </Button>
        }
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Collection name"
          className="h-10 w-full rounded-lg border border-line bg-surface-2 px-3 outline-none focus:border-accent"
        />
      </Dialog>
    </Page>
  );
}

function RemoveChip({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Remove from collection"
      title="Remove from collection"
      className="absolute right-3 top-3 z-20 rounded-full bg-black/70 p-1 text-white hover:bg-black"
    >
      <X className="size-3.5" />
    </button>
  );
}

/** Static page: the item is chosen with query parameters, e.g. /collection?id=…. */
export default function CollectionPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <CollectionRoute />
    </Suspense>
  );
}

function CollectionRoute() {
  const id = useSearchParams().get("id") ?? "";
  return <CollectionView key={id} id={id} />;
}
