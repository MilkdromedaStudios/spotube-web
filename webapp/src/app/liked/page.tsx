"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Download, Heart } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CollectionHeader, HeaderButton } from "@/components/CollectionHeader";
import { Page } from "@/components/Page";
import { TrackList } from "@/components/TrackList";
import { EmptyState, LoadingState } from "@/components/ui";
import { likedTracks, setLiked } from "@/lib/db/library";
import { getDb, useDbStatus } from "@/lib/db/db";
import { downloadJson, exportTracks } from "@/lib/db/backup";
import { toast } from "@/lib/toast";

const PAGE = 200;

export default function LikedPage() {
  const ready = useDbStatus((s) => s.status === "ready");
  const [limit, setLimit] = useState(PAGE);
  const total = useLiveQuery(async () => (ready ? getDb().likes.count() : undefined), [ready]);
  const tracks = useLiveQuery(async () => (ready ? likedTracks(0, limit) : undefined), [ready, limit]);
  const sentinel = useRef<HTMLDivElement>(null);

  // Load more rows as the user scrolls, so thousands of likes don't load at once.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !tracks || total === undefined || tracks.length >= total) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && setLimit((l) => l + PAGE), { rootMargin: "800px" });
    io.observe(el);
    return () => io.disconnect();
  }, [tracks, total]);

  if (!tracks) return <Page><LoadingState /></Page>;
  return (
    <Page>
      <CollectionHeader
        kind="liked"
        label="Playlist"
        title="Liked Songs"
        tracks={tracks}
        meta={`${total ?? tracks.length} song${total === 1 ? "" : "s"} · Saved in this browser`}
        actions={
          tracks.length > 0 && (
            <HeaderButton
              onClick={async () => {
                const all = await likedTracks(0, 100_000);
                downloadJson("liked-songs.spotube-playlist.json", exportTracks("Liked Songs", all));
                toast.success("Liked Songs exported");
              }}
            >
              <Download className="size-4" /> Export
            </HeaderButton>
          )
        }
      />
      {tracks.length ? (
        <>
          <TrackList tracks={tracks} onRemove={(t) => void setLiked(t, false)} removeLabel="Remove from Liked Songs" />
          <div ref={sentinel} />
        </>
      ) : (
        <EmptyState icon={<Heart className="size-8" />} title="Songs you like will appear here">
          Tap the heart on any song. Likes are stored only in this browser. <Link href="/search" className="underline">Find songs</Link>
        </EmptyState>
      )}
    </Page>
  );
}
