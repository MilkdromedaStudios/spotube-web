"use client";

import { Copy, ListPlus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { CollectionHeader, HeaderButton } from "@/components/CollectionHeader";
import { Page } from "@/components/Page";
import { ProviderGate } from "@/components/ProviderGate";
import { TrackList } from "@/components/TrackList";
import { EmptyState, ErrorState, LoadingState, Spinner } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { createPlaylist } from "@/lib/db/library";
import { providers } from "@/lib/providers";
import { toast } from "@/lib/toast";
import { isProviderId, type ProviderId } from "@/lib/types";
import { openAddToPlaylist } from "@/lib/uiStore";
import { playlistPath } from "@/lib/paths";

/** A playlist hosted by a provider. It can be copied into the local library. */
function RemotePlaylist({ provider, id }: { provider: ProviderId; id: string }) {
  const router = useRouter();
  const [copying, setCopying] = useState(false);
  const { data, error, loading, reload } = useAsync(() => providers[provider].playlist(id), [provider, id]);
  if (loading && !data) return <LoadingState label="Loading playlist…" />;
  if (error) return <ErrorState title="Couldn't load playlist" message={error.message} onRetry={reload} />;
  if (!data) return null;
  const { playlist, tracks } = data;
  return (
    <>
      <CollectionHeader
        kind="playlist"
        label="Playlist"
        title={playlist.name}
        artwork={playlist.artwork}
        provider={provider}
        tracks={tracks}
        description={playlist.description}
        meta={[playlist.owner && `By ${playlist.owner}`, `${tracks.length} playable tracks`].filter(Boolean).join(" • ")}
        actions={
          <>
            <HeaderButton
              disabled={copying || !tracks.length}
              onClick={async () => {
                setCopying(true);
                try {
                  const p = await createPlaylist({
                    name: playlist.name,
                    description: playlist.description ?? "",
                    artwork: playlist.artwork,
                    tracks,
                    source: { provider, id, url: playlist.url },
                  });
                  toast.success(`Saved "${p.name}" to your library`);
                  router.push(playlistPath(p.id));
                } catch {
                  /* toast shown */
                } finally {
                  setCopying(false);
                }
              }}
            >
              {copying ? <Spinner className="size-4" /> : <Copy className="size-4" />} Save copy to library
            </HeaderButton>
            <HeaderButton onClick={() => openAddToPlaylist(tracks)} disabled={!tracks.length}>
              <ListPlus className="size-4" /> Add to playlist
            </HeaderButton>
          </>
        }
      />
      {tracks.length ? <TrackList tracks={tracks} /> : <EmptyState title="No playable tracks in this playlist" />}
    </>
  );
}

function BrowsePlaylistView({ provider, id }: { provider: string; id: string }) {
  return (
    <Page>
      {isProviderId(provider) ? (
        <ProviderGate provider={provider}>
          <RemotePlaylist provider={provider} id={decodeURIComponent(id)} />
        </ProviderGate>
      ) : (
        <ErrorState message="Unknown music provider." />
      )}
    </Page>
  );
}

/** Static page: the item is chosen with query parameters, e.g. /browse-playlist?provider=…&id=…. */
export default function BrowsePlaylistPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <BrowsePlaylistRoute />
    </Suspense>
  );
}

function BrowsePlaylistRoute() {
  const params = useSearchParams();
  const provider = params.get("provider") ?? "";
  const id = params.get("id") ?? "";
  return <BrowsePlaylistView key={`${provider}:${id}`} provider={provider} id={id} />;
}
