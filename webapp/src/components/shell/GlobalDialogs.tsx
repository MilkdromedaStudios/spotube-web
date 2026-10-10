"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { CheckCircle2, FolderPlus, Info, ListPlus, Plus, XCircle } from "lucide-react";
import { useState } from "react";
import clsx from "clsx";
import { Artwork } from "@/components/Artwork";
import { Button, Dialog } from "@/components/ui";
import { usePlaylists } from "@/hooks/useLibrary";
import { getDb } from "@/lib/db/db";
import { addToCollection, addTracksToPlaylist, createCollection, createPlaylist } from "@/lib/db/library";
import { toast, useToasts } from "@/lib/toast";
import { useUi } from "@/lib/uiStore";

function AddToPlaylistDialog() {
  const tracks = useUi((s) => s.addToPlaylist);
  const playlists = usePlaylists();
  const [name, setName] = useState("");
  const close = () => {
    setName("");
    useUi.setState({ addToPlaylist: null });
  };
  if (!tracks) return null;
  const label = tracks.length === 1 ? `"${tracks[0].title}"` : `${tracks.length} tracks`;
  const add = async (id: string, pname: string) => {
    try {
      const { added, skipped } = await addTracksToPlaylist(id, tracks);
      if (added) toast.success(`Added ${added} to ${pname}${skipped ? ` (${skipped} already there)` : ""}`);
      else toast.info(`Already in ${pname}`);
      close();
    } catch {
      /* toast shown by write() */
    }
  };
  return (
    <Dialog open onClose={close} title={`Add ${label} to playlist`}>
      <form
        className="mb-4 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const p = await createPlaylist({ name, tracks });
            toast.success(`Created ${p.name}`);
            close();
          } catch {
            /* toast shown */
          }
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New playlist name"
          aria-label="New playlist name"
          className="h-10 flex-1 rounded-full border border-line bg-surface-2 px-4 text-sm outline-none focus:border-accent"
        />
        <Button type="submit" variant="primary">
          <Plus className="size-4" /> Create
        </Button>
      </form>
      {playlists?.length ? (
        <ul className="flex flex-col">
          {playlists.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => add(p.id, p.name)}
                className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-surface-2"
              >
                <Artwork src={p.artwork} kind="playlist" alt="" className="size-10" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="text-xs text-muted">{p.trackKeys.length} tracks</span>
                </span>
                <ListPlus className="size-4 text-muted" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">You don&apos;t have any playlists yet. Name one above to create it.</p>
      )}
    </Dialog>
  );
}

function AddToCollectionDialog() {
  const target = useUi((s) => s.addToCollection);
  const collections = useLiveQuery(() => getDb().collections.orderBy("updatedAt").reverse().toArray(), []);
  const [name, setName] = useState("");
  const close = () => {
    setName("");
    useUi.setState({ addToCollection: null });
  };
  if (!target) return null;
  const add = async (id: string, cname: string) => {
    try {
      const added = await addToCollection(id, target.type, target.key, target.payload);
      toast[added ? "success" : "info"](added ? `Added to ${cname}` : `Already in ${cname}`);
      close();
    } catch {
      /* toast shown */
    }
  };
  return (
    <Dialog open onClose={close} title={`Add "${target.name}" to a collection`}>
      <p className="mb-3 text-sm text-muted">Collections group any mix of playlists, albums, artists and songs.</p>
      <form
        className="mb-4 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const c = await createCollection(name);
            await add(c.id, c.name);
          } catch {
            /* toast shown */
          }
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
          <FolderPlus className="size-4" /> Create
        </Button>
      </form>
      <ul className="flex flex-col">
        {collections?.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => add(c.id, c.name)}
              className="flex w-full items-center justify-between rounded-lg p-3 text-left hover:bg-surface-2"
            >
              <span className="font-medium">{c.name}</span>
              <span className="text-xs text-muted">{c.items.length} items</span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

const SHORTCUTS: [string, string][] = [
  ["Space / K", "Play or pause"],
  ["Shift + N  /  Ctrl + →", "Next track"],
  ["Shift + P  /  Ctrl + ←", "Previous track"],
  ["J / L", "Seek back / forward 10 s"],
  ["← / →", "Seek back / forward 5 s"],
  ["Shift + ↑ / ↓", "Volume up / down"],
  ["M", "Mute"],
  ["S", "Shuffle"],
  ["R", "Repeat mode"],
  ["Q", "Show queue"],
  ["F", "Now playing view"],
  ["/", "Search"],
  ["?", "This help"],
];

function ShortcutsDialog() {
  const open = useUi((s) => s.shortcutsOpen);
  return (
    <Dialog open={open} onClose={() => useUi.setState({ shortcutsOpen: false })} title="Keyboard shortcuts">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        {SHORTCUTS.map(([k, v]) => (
          <div key={k} className="contents">
            <dt>
              <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-xs">{k}</kbd>
            </dt>
            <dd className="text-muted">{v}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}

function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-36 z-[95] flex flex-col items-center gap-2 px-4 md:bottom-24"
    >
      {toasts.map((t) => {
        const Icon = t.kind === "error" ? XCircle : t.kind === "success" ? CheckCircle2 : Info;
        return (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className="pointer-events-auto flex max-w-lg items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm shadow-2xl"
          >
            <Icon className={clsx("size-4 shrink-0", t.kind === "error" ? "text-danger" : t.kind === "success" ? "text-success" : "text-muted")} />
            <span className="flex-1">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="font-semibold text-accent"
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function GlobalDialogs() {
  return (
    <>
      <AddToPlaylistDialog />
      <AddToCollectionDialog />
      <ShortcutsDialog />
      <Toaster />
    </>
  );
}
