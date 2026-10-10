"use client";

import { ListX, X } from "lucide-react";
import { TrackList } from "@/components/TrackList";
import { Button, EmptyState, IconButton } from "@/components/ui";
import {
  clearQueue,
  currentTrack,
  moveInQueue,
  playQueueIndex,
  removeFromQueue,
  setQueueOpen,
  usePlayer,
} from "@/lib/player/engine";
import { openAddToPlaylist } from "@/lib/uiStore";

export function QueueList() {
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const cur = usePlayer((s) => currentTrack(s));
  if (!queue.length)
    return (
      <EmptyState icon={<ListX className="size-8" />} title="Your queue is empty">
        Play a song, album or playlist, or use “Add to queue” from a track menu.
      </EmptyState>
    );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {queue.length} track{queue.length === 1 ? "" : "s"}
          {cur ? ` · playing #${index + 1}` : ""}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="whitespace-nowrap" onClick={() => openAddToPlaylist(queue)}>
            Save as playlist
          </Button>
          <Button size="sm" variant="ghost" onClick={clearQueue}>
            Clear
          </Button>
        </div>
      </div>
      <TrackList
        tracks={queue}
        showAlbum={false}
        onPlay={playQueueIndex}
        onRemove={(_, i) => removeFromQueue(i)}
        removeLabel="Remove from queue"
        onReorder={moveInQueue}
      />
    </div>
  );
}

export function QueuePanel() {
  const open = usePlayer((s) => s.queueOpen);
  if (!open) return null;
  return (
    <aside
      className="fixed inset-y-0 right-0 z-[60] flex w-full max-w-md flex-col border-l border-line bg-surface shadow-2xl"
      aria-label="Queue"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-lg font-semibold">Queue</h2>
        <IconButton label="Close queue" onClick={() => setQueueOpen(false)}>
          <X className="size-5" />
        </IconButton>
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto p-3">
        <QueueList />
      </div>
    </aside>
  );
}
