"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import {
  Disc3,
  ExternalLink,
  FolderPlus,
  GripVertical,
  Heart,
  ListEnd,
  ListPlus,
  ListStart,
  Mic2,
  MoreHorizontal,
  Play,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useMemo } from "react";
import { Artwork } from "./Artwork";
import { ProviderBadge } from "./ProviderBadge";
import { Menu } from "./ui";
import { useLikedKeys } from "@/hooks/useLibrary";
import { setLiked } from "@/lib/db/library";
import { addToQueue, currentTrack, playNext, playTracks, usePlayer } from "@/lib/player/engine";
import { formatTime } from "@/lib/player/queue";
import { pathFor } from "@/lib/providers";
import { useSettings } from "@/lib/settings";
import { toast } from "@/lib/toast";
import { artistNames, type Track } from "@/lib/types";
import { openAddToCollection, openAddToPlaylist } from "@/lib/uiStore";

export function Equalizer() {
  return (
    <span className="flex h-3.5 items-end gap-0.5" aria-label="Now playing">
      {[0, 0.2, 0.4].map((d) => (
        <span key={d} className="eq-bar w-0.5 rounded-sm bg-accent" style={{ height: "100%", animationDelay: `${d}s` }} />
      ))}
    </span>
  );
}

export function LikeButton({ track, liked, className }: { track: Track; liked: boolean; className?: string }) {
  return (
    <button
      type="button"
      aria-label={liked ? `Remove ${track.title} from Liked Songs` : `Save ${track.title} to Liked Songs`}
      aria-pressed={liked}
      title={liked ? "Remove from Liked Songs" : "Save to Liked Songs"}
      onClick={(e) => {
        e.stopPropagation();
        setLiked(track, !liked)
          .then(() => toast.success(liked ? "Removed from Liked Songs" : "Added to Liked Songs"))
          .catch(() => {});
      }}
      className={clsx("inline-flex size-8 items-center justify-center rounded-full hover:bg-surface-3", liked ? "text-accent" : "text-muted hover:text-fg", className)}
    >
      <Heart className={clsx("size-4", liked && "fill-current")} />
    </button>
  );
}

export function trackMenuItems(
  track: Track,
  navigate: (href: string) => void,
  extra?: { onRemove?: () => void; removeLabel?: string },
) {
  return [
    { label: "Play next", icon: <ListStart />, onSelect: () => (playNext(track), toast.info("Playing next")) },
    {
      label: "Add to queue",
      icon: <ListEnd />,
      onSelect: () => toast.info(addToQueue([track]) ? "Added to queue" : "Already in the queue"),
    },
    { label: "Add to playlist…", icon: <ListPlus />, onSelect: () => openAddToPlaylist([track]) },
    {
      label: "Add to collection…",
      icon: <FolderPlus />,
      onSelect: () => openAddToCollection({ type: "track", key: track.key, name: track.title, payload: { track } }),
    },
    track.album?.id && track.provider !== "youtube"
      ? { label: "Go to album", icon: <Disc3 />, onSelect: () => navigate(pathFor("album", track.provider, track.album!.id!)) }
      : null,
    track.artists[0]?.id
      ? { label: "Go to artist", icon: <Mic2 />, onSelect: () => navigate(pathFor("artist", track.provider, track.artists[0].id!)) }
      : null,
    track.provider === "spotify"
      ? {
          label: "Find a playable version on YouTube",
          icon: <Play />,
          onSelect: () =>
            navigate(`/search?${new URLSearchParams({ q: [track.title, artistNames(track)].filter(Boolean).join(" "), provider: "youtube", type: "tracks" })}`),
        }
      : null,
    track.url
      ? { label: "Open on provider site", icon: <ExternalLink />, onSelect: () => window.open(track.url, "_blank", "noopener,noreferrer") }
      : null,
    extra?.onRemove ? { label: extra.removeLabel ?? "Remove", icon: <Trash2 />, danger: true, onSelect: extra.onRemove } : null,
  ];
}

interface RowProps {
  track: Track;
  index: number;
  active: boolean;
  playing: boolean;
  liked: boolean;
  showAlbum: boolean;
  onPlay: (i: number) => void;
  onRemove?: (t: Track, i: number) => void;
  removeLabel?: string;
  sortable?: boolean;
}

const Row = memo(function Row({ track, index, active, playing, liked, showAlbum, onPlay, onRemove, removeLabel, sortable }: RowProps) {
  const s = useSortable({ id: track.key, disabled: !sortable });
  const router = useRouter();
  const style = sortable ? { transform: CSS.Transform.toString(s.transform), transition: s.transition } : undefined;
  return (
    <li
      ref={sortable ? s.setNodeRef : undefined}
      style={style}
      className={clsx(
        "track-row group grid items-center gap-3 rounded-md px-2 py-1.5 hover:bg-surface-2",
        showAlbum
          ? "grid-cols-[auto_minmax(0,1fr)_auto] md:grid-cols-[2rem_minmax(0,3fr)_minmax(0,2fr)_auto_auto]"
          : "grid-cols-[auto_minmax(0,1fr)_auto] md:grid-cols-[2rem_minmax(0,1fr)_auto_auto]",
        s.isDragging && "relative z-10 bg-surface-3 shadow-xl",
      )}
      onDoubleClick={() => onPlay(index)}
    >
      <div className="relative hidden h-8 w-8 items-center justify-center text-sm text-subtle md:flex">
        <span className={clsx(sortable && "group-hover:opacity-0 group-focus-within:opacity-0")}>
          {active && playing ? <Equalizer /> : <span className={clsx(active && "text-accent")}>{index + 1}</span>}
        </span>
        {sortable && (
          <button
            type="button"
            {...s.attributes}
            {...s.listeners}
            aria-label={`Reorder ${track.title}`}
            className="absolute inset-0 flex cursor-grab touch-none items-center justify-center text-subtle opacity-0 group-hover:opacity-100 focus:opacity-100 active:cursor-grabbing"
          >
            <GripVertical className="size-4" />
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => onPlay(index)}
        className="flex min-w-0 items-center gap-3 text-left"
        aria-label={`Play ${track.title} by ${artistNames(track)}`}
      >
        <div className="relative">
          <Artwork src={track.artwork} alt="" className="size-10" />
          <span className="absolute inset-0 hidden items-center justify-center rounded-md bg-black/50 group-hover:flex">
            <Play className="size-4 fill-white text-white" />
          </span>
        </div>
        <span className="min-w-0">
          <span className={clsx("block truncate font-medium", active && "text-accent")}>
            {track.explicit && (
              <span className="mr-1.5 rounded-sm bg-surface-3 px-1 text-[10px] font-bold text-muted" title="Explicit">
                E
              </span>
            )}
            {track.title}
          </span>
          <span className="flex items-center gap-1.5 truncate text-sm text-muted">
            <ProviderBadge provider={track.provider} />
            <span className="truncate">{artistNames(track)}</span>
          </span>
        </span>
      </button>
      {showAlbum && (
        <div className="hidden min-w-0 truncate text-sm text-muted md:block">
          {track.album?.id && track.provider !== "youtube" ? (
            <Link href={pathFor("album", track.provider, track.album.id)} className="hover:text-fg hover:underline">
              {track.album.name}
            </Link>
          ) : (
            track.album?.name
          )}
        </div>
      )}
      <div className="hidden items-center gap-2 md:flex">
        <LikeButton track={track} liked={liked} className={clsx(!liked && "opacity-0 group-hover:opacity-100 focus:opacity-100")} />
        <span className="w-12 text-right text-sm tabular-nums text-muted">{formatTime(track.durationMs)}</span>
      </div>
      <Menu
        label={`More options for ${track.title}`}
        trigger={<MoreHorizontal className="size-4" />}
        items={[
          ...trackMenuItems(track, router.push, onRemove ? { onRemove: () => onRemove(track, index), removeLabel } : undefined),
          { label: liked ? "Remove from Liked Songs" : "Save to Liked Songs", icon: <Heart />, onSelect: () => void setLiked(track, !liked) },
        ]}
      />
    </li>
  );
});

export function TrackList({
  tracks,
  showAlbum = true,
  onPlay,
  onRemove,
  removeLabel,
  onReorder,
  className,
}: {
  tracks: Track[];
  showAlbum?: boolean;
  onPlay?: (index: number) => void;
  onRemove?: (track: Track, index: number) => void;
  removeLabel?: string;
  /** Enables drag-and-drop ordering */
  onReorder?: (from: number, to: number) => void;
  className?: string;
}) {
  const liked = useLikedKeys();
  const { compactLists } = useSettings();
  const cur = usePlayer((s) => currentTrack(s)?.key);
  const playing = usePlayer((s) => s.status === "playing" || s.status === "buffering" || s.status === "loading");
  const play = onPlay ?? ((i: number) => void playTracks(tracks, i));
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = useMemo(() => tracks.map((t) => t.key), [tracks]);

  const rows = tracks.map((t, i) => (
    <Row
      key={t.key}
      track={t}
      index={i}
      active={t.key === cur}
      playing={playing}
      liked={liked.has(t.key)}
      showAlbum={showAlbum}
      onPlay={play}
      onRemove={onRemove}
      removeLabel={removeLabel}
      sortable={!!onReorder}
    />
  ));

  const list = <ol className={clsx("flex flex-col", compactLists && "compact [&_.track-row]:py-0.5", className)}>{rows}</ol>;
  if (!onReorder) return list;
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    onReorder(ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {list}
      </SortableContext>
    </DndContext>
  );
}
