import { getDb } from "@/lib/db/db";
import { createPlaylist, deletePlaylist, getTracks } from "@/lib/db/library";
import { expandCollection } from "@/lib/player/expand";
import type { PlaylistRecord } from "@/lib/db/schema";
import { providers, resolveLink } from "@/lib/providers";
import { CONFIG_HINT, ProviderError } from "@/lib/providers/api";
import type { ParsedLink } from "@/lib/providers/links";
import type { Track } from "@/lib/types";

export interface SavedLink {
  playlist: PlaylistRecord;
  tracks: Track[];
  /** True when this link was saved before, so nothing new was added. */
  existed: boolean;
}

/**
 * Saves a pasted playlist or album link into the library as a playlist, once.
 * With the provider's API configured it copies every song; without it, the
 * whole playlist becomes one item that plays in the provider's own player.
 */
export async function savePlaylistLink(link: ParsedLink, providerReady: boolean): Promise<SavedLink> {
  const db = getDb();
  const existing = await db.playlists
    .filter((p) => p.source?.provider === link.provider && p.source.id === link.id)
    .first();
  if (existing) {
    const saved = await getTracks(existing.trackKeys);
    // A playlist saved earlier as one item is upgraded to its songs when they can now be listed.
    const songs = saved.length === 1 && !providerReady ? await expandCollection(saved[0]).catch(() => null) : null;
    if (!songs?.length) return { playlist: existing, tracks: saved, existed: true };
    await deletePlaylist(existing.id);
    const playlist = await createPlaylist({
      name: existing.name,
      description: existing.description,
      artwork: existing.artwork,
      tracks: songs,
      source: existing.source,
    });
    return { playlist, tracks: songs, existed: false };
  }

  let name: string | undefined;
  let artwork: string | undefined;
  let tracks: Track[] = [];
  const client = providers[link.provider];
  if (providerReady && link.kind === "album" && client.album) {
    const r = await client.album(link.id);
    ({ name, artwork } = r.album);
    tracks = r.tracks;
  } else if (providerReady && link.kind === "playlist") {
    let id = link.id;
    if (link.provider === "soundcloud") {
      // SoundCloud links are permalinks; the API wants the numeric playlist id.
      const r = await resolveLink(link.url);
      if (r.kind !== "playlist") throw new ProviderError("That SoundCloud link isn't a playlist.", "bad_request");
      id = r.id;
    }
    const r = await client.playlist(id);
    ({ name, artwork } = r.playlist);
    tracks = r.tracks;
  }
  if (!tracks.length) {
    const r = await resolveLink(link.url);
    if (r.kind !== "track") throw new ProviderError(CONFIG_HINT[link.provider], "not_configured");
    name = r.track.title;
    artwork = r.track.artwork;
    // YouTube playlists and SoundCloud sets are saved song by song; Spotify playlists stay one item.
    const songs = await expandCollection(r.track).catch(() => null);
    tracks = songs?.length ? songs : [r.track];
  }
  const playlist = await createPlaylist({
    name,
    artwork,
    tracks,
    source: { provider: link.provider, id: link.id, url: link.url },
  });
  return { playlist, tracks, existed: false };
}
