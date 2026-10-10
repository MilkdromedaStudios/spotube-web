"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Clock, Heart, ListMusic, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Artwork } from "@/components/Artwork";
import { AlbumCard, ArtistCard, CardRow, MediaCard, PlaylistCard, Section } from "@/components/Cards";
import { LinkPlayer } from "@/components/LinkPlayer";
import { Page } from "@/components/Page";
import { TrackCard } from "@/components/TrackCard";
import { TrackList } from "@/components/TrackList";
import { ErrorState, Notice, Skeleton } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { usePlaylists } from "@/hooks/useLibrary";
import { getDb, useDbStatus } from "@/lib/db/db";
import { getTracks, recentlyPlayed } from "@/lib/db/library";
import { playTracks } from "@/lib/player/engine";
import { providers, useProviderStatuses } from "@/lib/providers";
import type { HomeSection } from "@/lib/providers/types";
import { useSpotifyAuth } from "@/lib/providers/spotify";
import type { ProviderId } from "@/lib/types";

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function ProviderSections({ provider }: { provider: ProviderId }) {
  const spotifyConnected = useSpotifyAuth((s) => s.connected);
  const client = providers[provider];
  const { data, error, loading, reload } = useAsync<HomeSection[]>(
    () => client.home!(),
    [provider, provider === "spotify" ? spotifyConnected : null],
  );
  if (loading && !data)
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-7 w-64" />
        <div className="flex gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="aspect-square w-40" />
          ))}
        </div>
      </div>
    );
  if (error) return <ErrorState title={`Couldn't load ${client.id === "youtube" ? "YouTube" : "Spotify"} recommendations`} message={error.message} onRetry={reload} />;
  return (
    <>
      {data?.map((s) => (
        <Section key={s.title} title={s.title}>
          <CardRow>
            {s.tracks?.map((t, i) => <TrackCard key={t.key} track={t} list={s.tracks!} index={i} />)}
            {s.albums?.map((a) => <AlbumCard key={a.key} album={a} />)}
            {s.playlists?.map((p) => <PlaylistCard key={p.key} playlist={p} />)}
            {s.artists?.map((a) => <ArtistCard key={a.key} artist={a} />)}
          </CardRow>
        </Section>
      ))}
    </>
  );
}

export default function HomePage() {
  const [hello, setHello] = useState("Welcome");
  useEffect(() => setHello(greeting()), []);
  const ready = useDbStatus((s) => s.status === "ready");
  const playlists = usePlaylists();
  const recent = useLiveQuery(() => (ready ? recentlyPlayed(12) : []), [ready]);
  const added = useLiveQuery(
    async () => (ready ? getDb().tracks.orderBy("addedAt").reverse().limit(10).toArray() : []),
    [ready],
  );
  const likedCount = useLiveQuery(() => (ready ? getDb().likes.count() : 0), [ready]);
  const statuses = useProviderStatuses();
  const withHome = statuses.filter((s) => s.ready && providers[s.id].home);
  const anyReady = statuses.some((s) => s.ready);
  const pinned = (playlists ?? []).slice(0, 5);

  return (
    <Page>
      <h1 className="text-3xl font-bold tracking-tight">{hello}</h1>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <Link href="/liked" className="flex items-center gap-3 overflow-hidden rounded-lg bg-surface-2 pr-3 hover:bg-surface-3">
          <span className="flex size-14 items-center justify-center bg-gradient-to-br from-indigo-600 to-sky-400">
            <Heart className="size-6 fill-white text-white" />
          </span>
          <span className="font-semibold">Liked Songs</span>
          <span className="ml-auto text-sm text-muted">{likedCount ?? 0}</span>
        </Link>
        {pinned.map((p) => (
          <Link key={p.id} href={`/playlist/${p.id}`} className="flex items-center gap-3 overflow-hidden rounded-lg bg-surface-2 pr-3 hover:bg-surface-3">
            <Artwork src={p.artwork} kind="playlist" alt="" className="size-14 rounded-none" />
            <span className="truncate font-semibold">{p.name}</span>
            <span className="ml-auto text-sm text-muted">{p.trackKeys.length}</span>
          </Link>
        ))}
      </div>

      <LinkPlayer />

      {!anyReady && (
        <Notice>
          <Sparkles className="mr-1 inline size-4" /> No music provider has search enabled on this deployment yet, so recommendations
          are hidden. You can still paste links above, and build playlists. The site owner can add API keys as described in the
          README; see <Link href="/settings#providers" className="underline">Settings → Music providers</Link> for status.
        </Notice>
      )}

      {recent && recent.length > 0 && (
        <Section
          title="Recently played"
          action={
            <Link href="/library?tab=history" className="text-sm font-medium text-muted hover:text-fg">
              Show all
            </Link>
          }
        >
          <CardRow>
            {recent.map((t, i) => (
              <TrackCard key={t.key} track={t} list={recent} index={i} />
            ))}
          </CardRow>
        </Section>
      )}

      {playlists && playlists.length > 0 && (
        <Section title="Your playlists">
          <CardRow>
            {playlists.map((p) => (
              <MediaCard
                key={p.id}
                href={`/playlist/${p.id}`}
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
          </CardRow>
        </Section>
      )}

      {withHome.map((s) => (
        <ProviderSections key={s.id} provider={s.id} />
      ))}

      {added && added.length > 0 && (
        <Section title="Recently added">
          <TrackList tracks={added} />
        </Section>
      )}

      {recent?.length === 0 && playlists?.length === 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Tip icon={<ListMusic />} title="Make a playlist">
            Playlists live in this browser’s IndexedDB. No account needed.
          </Tip>
          <Tip icon={<Clock />} title="Pick up where you left off">
            Your queue, volume and position are restored when you come back.
          </Tip>
          <Tip icon={<Heart />} title="Back it up">
            Export everything to a JSON file in Settings → Storage.
          </Tip>
        </div>
      )}
    </Page>
  );
}

function Tip({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line p-4">
      <div className="mb-2 text-accent [&>svg]:size-5">{icon}</div>
      <p className="font-semibold">{title}</p>
      <p className="text-sm text-muted">{children}</p>
    </div>
  );
}
