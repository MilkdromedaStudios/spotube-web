"use client";

import { FolderPlus, Heart, ListPlus } from "lucide-react";
import { useParams } from "next/navigation";
import clsx from "clsx";
import { CollectionHeader, HeaderButton } from "@/components/CollectionHeader";
import { Page } from "@/components/Page";
import { ProviderGate } from "@/components/ProviderGate";
import { TrackList } from "@/components/TrackList";
import { ErrorState, LoadingState } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { useSavedAlbumKeys } from "@/hooks/useLibrary";
import { setAlbumSaved } from "@/lib/db/library";
import { formatTime } from "@/lib/player/queue";
import { providers } from "@/lib/providers";
import { toast } from "@/lib/toast";
import { isProviderId, type ProviderId } from "@/lib/types";
import { openAddToCollection, openAddToPlaylist } from "@/lib/uiStore";

function Album({ provider, id }: { provider: ProviderId; id: string }) {
  const client = providers[provider];
  const saved = useSavedAlbumKeys();
  const { data, error, loading, reload } = useAsync(async () => {
    if (!client.album) throw new Error("This provider has no album pages.");
    return client.album(id);
  }, [provider, id]);
  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorState title="Couldn't load album" message={error.message} onRetry={reload} />;
  if (!data) return null;
  const { album, tracks } = data;
  const isSaved = saved.has(album.key);
  const total = tracks.reduce((a, t) => a + (t.durationMs ?? 0), 0);
  return (
    <>
      <CollectionHeader
        kind="album"
        label="Album"
        title={album.name}
        artwork={album.artwork}
        provider={provider}
        tracks={tracks}
        meta={[album.artists.map((a) => a.name).join(", "), album.year, `${tracks.length} songs`, total ? formatTime(total) : ""]
          .filter(Boolean)
          .join(" • ")}
        actions={
          <>
            <HeaderButton
              aria-pressed={isSaved}
              onClick={() =>
                setAlbumSaved(album, !isSaved).then(() => toast.success(isSaved ? "Removed from your library" : "Saved to your library"))
              }
            >
              <Heart className={clsx("size-4", isSaved && "fill-accent text-accent")} /> {isSaved ? "Saved" : "Save album"}
            </HeaderButton>
            <HeaderButton onClick={() => openAddToPlaylist(tracks)} disabled={!tracks.length}>
              <ListPlus className="size-4" /> Add to playlist
            </HeaderButton>
            <HeaderButton onClick={() => openAddToCollection({ type: "album", key: album.key, name: album.name, payload: { album } })}>
              <FolderPlus className="size-4" /> Collection
            </HeaderButton>
          </>
        }
      />
      <TrackList tracks={tracks} showAlbum={false} />
    </>
  );
}

export default function AlbumPage() {
  const { provider, id } = useParams<{ provider: string; id: string }>();
  return (
    <Page>
      {isProviderId(provider) ? (
        <ProviderGate provider={provider}>
          <Album provider={provider} id={decodeURIComponent(id)} />
        </ProviderGate>
      ) : (
        <ErrorState message="Unknown music provider." />
      )}
    </Page>
  );
}
