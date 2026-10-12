"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Download, ImagePlus, ListMusic, MoreHorizontal, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Artwork } from "@/components/Artwork";
import { CollectionHeader } from "@/components/CollectionHeader";
import { Page } from "@/components/Page";
import { TrackList } from "@/components/TrackList";
import { Button, Dialog, EmptyState, ErrorState, LoadingState, Menu, Notice, Spinner } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { downloadJson, exportPlaylist, safeFilename } from "@/lib/db/backup";
import { getDb, useDbStatus } from "@/lib/db/db";
import { addTracksToPlaylist, deletePlaylist, getTracks, removeFromPlaylist, reorderPlaylist, searchLibrary, updatePlaylist } from "@/lib/db/library";
import { providers, useProviderStatuses } from "@/lib/providers";
import { useSettings } from "@/lib/settings";
import { toast } from "@/lib/toast";
import { PROVIDER_LABELS, artistNames, type ProviderId, type Track } from "@/lib/types";
import { formatTime } from "@/lib/player/queue";

/** Resizes an uploaded image to a square JPEG so covers stay small in IndexedDB. */
async function toCover(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 15 * 1024 * 1024) throw new Error("That image is too large (15 MB max).");
  const bmp = await createImageBitmap(file);
  const size = 400;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const s = Math.min(bmp.width, bmp.height);
  ctx.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't process image"))), "image/jpeg", 0.85));
}

function EditDialog({ open, onClose, id, name, description }: { open: boolean; onClose: () => void; id: string; name: string; description: string }) {
  const [n, setN] = useState(name);
  const [d, setD] = useState(description);
  useEffect(() => {
    if (open) {
      setN(name);
      setD(description);
    }
  }, [open, name, description]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit details"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!n.trim()}
            onClick={async () => {
              try {
                await updatePlaylist(id, { name: n, description: d });
                toast.success("Playlist updated");
                onClose();
              } catch (e) {
                if ((e as Error).message.includes("empty")) toast.error((e as Error).message);
              }
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <label className="mb-3 block text-sm">
        <span className="mb-1 block text-muted">Name</span>
        <input value={n} onChange={(e) => setN(e.target.value)} maxLength={100} className="h-10 w-full rounded-lg border border-line bg-surface-2 px-3 outline-none focus:border-accent" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-muted">Description</span>
        <textarea value={d} onChange={(e) => setD(e.target.value)} maxLength={300} rows={3} className="w-full rounded-lg border border-line bg-surface-2 p-3 outline-none focus:border-accent" />
      </label>
    </Dialog>
  );
}

/** Inline "find songs to add" panel searching the library and the preferred provider. */
function AddSongs({ playlistId, existing }: { playlistId: string; existing: Set<string> }) {
  const settings = useSettings();
  const statuses = useProviderStatuses();
  const ready = statuses.filter((s) => s.ready);
  const [provider, setProvider] = useState<ProviderId | "library">(
    ready.find((s) => s.id === settings.preferredProvider)?.id ?? ready[0]?.id ?? "library",
  );
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const { data, loading, error } = useAsync<Track[]>(
    async () => (provider === "library" ? searchLibrary(submitted, 30) : (await providers[provider].search(submitted, ["tracks"])).tracks),
    [submitted, provider],
    !!submitted,
  );
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line p-4">
      <h2 className="font-semibold">Find songs for your playlist</h2>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(q.trim());
        }}
      >
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as ProviderId | "library")}
          aria-label="Search source"
          className="h-10 rounded-full border border-line bg-surface-2 px-3 text-sm"
        >
          <option value="library">Your library</option>
          {ready.map((s) => (
            <option key={s.id} value={s.id}>
              {PROVIDER_LABELS[s.id]}
            </option>
          ))}
        </select>
        <div className="flex flex-1 items-center gap-2 rounded-full border border-line bg-surface-2 px-3 focus-within:border-accent">
          <Search className="size-4 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for songs" aria-label="Search for songs" className="h-10 flex-1 bg-transparent text-sm outline-none" />
        </div>
        <Button type="submit" disabled={!q.trim()}>
          Search
        </Button>
      </form>
      {!ready.length && (
        <p className="text-xs text-muted">Only songs in your library can be searched here right now. You can also paste links on the Home page.</p>
      )}
      {loading && <LoadingState label="Searching…" />}
      {error && <ErrorState message={error.message} />}
      {data && !data.length && <p className="text-sm text-muted">No songs found.</p>}
      <ul className="flex flex-col">
        {data?.map((t) => (
          <li key={t.key} className="flex items-center gap-3 rounded-md p-2 hover:bg-surface-2">
            <Artwork src={t.artwork} alt="" className="size-10" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{t.title}</span>
              <span className="block truncate text-xs text-muted">
                {artistNames(t)} · {formatTime(t.durationMs)}
              </span>
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={existing.has(t.key)}
              onClick={async () => {
                const r = await addTracksToPlaylist(playlistId, [t]).catch(() => null);
                if (r?.added) toast.success(`Added "${t.title}"`);
              }}
            >
              {existing.has(t.key) ? "Added" : "Add"}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PlaylistView({ id }: { id: string }) {
  const router = useRouter();
  const ready = useDbStatus((s) => s.status === "ready");
  const playlist = useLiveQuery(async () => (ready ? ((await getDb().playlists.get(id)) ?? null) : undefined), [id, ready]);
  const tracks = useLiveQuery(async () => (playlist ? getTracks(playlist.trackKeys) : []), [playlist]);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busyCover, setBusyCover] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  if (playlist === undefined || tracks === undefined) return <Page><LoadingState /></Page>;
  if (playlist === null)
    return (
      <Page>
        <EmptyState icon={<ListMusic className="size-8" />} title="Playlist not found">
          It may have been deleted, or it was created in a different browser. Playlists are stored only in the browser where you made them.
        </EmptyState>
      </Page>
    );

  const totalMs = tracks.reduce((a, t) => a + (t.durationMs ?? 0), 0);
  const missing = playlist.trackKeys.length - tracks.length;

  return (
    <Page>
      <CollectionHeader
        kind="playlist"
        label="Playlist"
        title={playlist.name}
        tracks={tracks}
        description={playlist.description || undefined}
        meta={`${tracks.length} track${tracks.length === 1 ? "" : "s"}${totalMs ? ` · ${formatTime(totalMs)}` : ""} · Saved in this browser`}
        artworkSlot={
          <div className="group relative">
            <Artwork src={playlist.artwork} alt={`Cover of ${playlist.name}`} kind="playlist" className="size-48 shadow-2xl md:size-56" />
            <button
              type="button"
              onClick={() => file.current?.click()}
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-md bg-black/60 text-sm font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
              aria-label="Choose cover image"
            >
              {busyCover ? <Spinner /> : <ImagePlus className="size-8" />}
              Choose cover
            </button>
            <input
              ref={file}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setBusyCover(true);
                try {
                  await updatePlaylist(playlist.id, { artwork: await toCover(f) });
                  toast.success("Cover updated");
                } catch (err) {
                  if (!(err as Error).name?.includes("Dexie")) toast.error((err as Error).message);
                } finally {
                  setBusyCover(false);
                }
              }}
            />
          </div>
        }
        titleSlot={
          <button type="button" onClick={() => setEditing(true)} className="text-left" title="Edit details">
            <h1 className="break-words text-3xl font-extrabold tracking-tight md:text-5xl">{playlist.name}</h1>
          </button>
        }
        actions={
          <>
            <Button variant={adding ? "secondary" : "outline"} size="sm" onClick={() => setAdding((a) => !a)}>
              {adding ? <X className="size-4" /> : <Plus className="size-4" />} {adding ? "Done adding" : "Add songs"}
            </Button>
            <Menu
              label="Playlist options"
              trigger={<MoreHorizontal className="size-5" />}
              items={[
                { label: "Edit details", icon: <Pencil />, onSelect: () => setEditing(true) },
                { label: "Choose cover image", icon: <ImagePlus />, onSelect: () => file.current?.click() },
                playlist.artwork ? { label: "Remove cover image", icon: <X />, onSelect: () => void updatePlaylist(playlist.id, { artwork: undefined }) } : null,
                {
                  label: "Export as a file",
                  icon: <Download />,
                  onSelect: async () => {
                    downloadJson(`${safeFilename(playlist.name)}.spotube-playlist.json`, await exportPlaylist(playlist.id));
                    toast.success("Playlist exported");
                  },
                },
                { label: "Delete playlist", icon: <Trash2 />, danger: true, onSelect: () => setConfirmDelete(true) },
              ]}
            />
          </>
        }
      />
      {missing > 0 && <Notice tone="warn">{missing} track{missing === 1 ? " is" : "s are"} missing from local storage and can&apos;t be shown.</Notice>}
      {adding && <AddSongs playlistId={playlist.id} existing={new Set(playlist.trackKeys)} />}
      {tracks.length ? (
        <TrackList
          tracks={tracks}
          onRemove={async (t) => {
            await removeFromPlaylist(playlist.id, t.key);
            toast.info(`Removed "${t.title}"`, { label: "Undo", run: () => void addTracksToPlaylist(playlist.id, [t]) });
          }}
          removeLabel="Remove from this playlist"
          onReorder={(from, to) => void reorderPlaylist(playlist.id, from, to)}
        />
      ) : (
        !adding && (
          <EmptyState
            icon={<ListMusic className="size-8" />}
            title="Let's find something for your playlist"
            action={
              <Button variant="primary" onClick={() => setAdding(true)}>
                <Plus className="size-4" /> Add songs
              </Button>
            }
          >
            Search providers or your library, or use “Add to playlist” on any song.
          </EmptyState>
        )
      )}
      <EditDialog open={editing} onClose={() => setEditing(false)} id={playlist.id} name={playlist.name} description={playlist.description} />
      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete playlist?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await deletePlaylist(playlist.id);
                toast.success(`Deleted ${playlist.name}`);
                router.push("/library");
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          This removes <strong className="text-fg">{playlist.name}</strong> from this browser. Export it first if you want a copy.
        </p>
      </Dialog>
    </Page>
  );
}

/** Static page: the item is chosen with query parameters, e.g. /playlist?id=…. */
export default function PlaylistPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <PlaylistRoute />
    </Suspense>
  );
}

function PlaylistRoute() {
  const id = useSearchParams().get("id") ?? "";
  return <PlaylistView key={id} id={id} />;
}
