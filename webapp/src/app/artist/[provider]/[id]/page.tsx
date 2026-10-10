"use client";

import clsx from "clsx";
import { FolderPlus, UserCheck, UserPlus } from "lucide-react";
import { useParams } from "next/navigation";
import { AlbumCard, CardGrid, PlaylistCard, Section } from "@/components/Cards";
import { CollectionHeader, HeaderButton } from "@/components/CollectionHeader";
import { Page } from "@/components/Page";
import { ProviderGate } from "@/components/ProviderGate";
import { TrackList } from "@/components/TrackList";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { useSavedArtistKeys } from "@/hooks/useLibrary";
import { setArtistSaved } from "@/lib/db/library";
import { providers } from "@/lib/providers";
import { toast } from "@/lib/toast";
import { isProviderId, type ProviderId } from "@/lib/types";
import { openAddToCollection } from "@/lib/uiStore";

const fmt = new Intl.NumberFormat("en", { notation: "compact" });

function Artist({ provider, id }: { provider: ProviderId; id: string }) {
  const saved = useSavedArtistKeys();
  const { data, error, loading, reload } = useAsync(() => providers[provider].artist(id), [provider, id]);
  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorState title="Couldn't load artist" message={error.message} onRetry={reload} />;
  if (!data) return null;
  const { artist, topTracks, albums, playlists } = data;
  const following = saved.has(artist.key);
  return (
    <>
      <CollectionHeader
        kind="artist"
        label="Artist"
        title={artist.name}
        artwork={artist.artwork}
        provider={provider}
        tracks={topTracks}
        meta={artist.followers !== undefined ? `${fmt.format(artist.followers)} followers` : undefined}
        actions={
          <>
            <HeaderButton
              aria-pressed={following}
              onClick={() =>
                setArtistSaved(artist, !following).then(() => toast.success(following ? "Removed from favorite artists" : "Added to favorite artists"))
              }
            >
              {following ? <UserCheck className={clsx("size-4 text-accent")} /> : <UserPlus className="size-4" />}
              {following ? "Following" : "Follow"}
            </HeaderButton>
            <HeaderButton onClick={() => openAddToCollection({ type: "artist", key: artist.key, name: artist.name, payload: { artist } })}>
              <FolderPlus className="size-4" /> Collection
            </HeaderButton>
          </>
        }
      />
      <Section title="Popular">
        {topTracks.length ? <TrackList tracks={topTracks} /> : <EmptyState title="No tracks available" />}
      </Section>
      {albums.length > 0 && (
        <Section title="Discography">
          <CardGrid>
            {albums.map((a) => (
              <AlbumCard key={a.key} album={a} />
            ))}
          </CardGrid>
        </Section>
      )}
      {playlists.length > 0 && (
        <Section title="Playlists">
          <CardGrid>
            {playlists.map((p) => (
              <PlaylistCard key={p.key} playlist={p} />
            ))}
          </CardGrid>
        </Section>
      )}
    </>
  );
}

export default function ArtistPage() {
  const { provider, id } = useParams<{ provider: string; id: string }>();
  return (
    <Page>
      {isProviderId(provider) ? (
        <ProviderGate provider={provider}>
          <Artist provider={provider} id={decodeURIComponent(id)} />
        </ProviderGate>
      ) : (
        <ErrorState message="Unknown music provider." />
      )}
    </Page>
  );
}
