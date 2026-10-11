"use client";

import { Link2, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Spinner } from "./ui";
import { playlistPath } from "@/lib/paths";
import { playTrack, playTracks } from "@/lib/player/engine";
import { pathFor, resolveLink, useProviderStatuses } from "@/lib/providers";
import { parseMusicLink } from "@/lib/providers/links";
import { savePlaylistLink } from "@/lib/savePlaylistLink";
import { toast } from "@/lib/toast";

/**
 * Plays any YouTube / YouTube Music / Spotify / SoundCloud / Apple Music share link.
 * Playlist and album links are saved to the library first, then played.
 */
export function useOpenLink() {
  const router = useRouter();
  const statuses = useProviderStatuses();
  const [busy, setBusy] = useState(false);
  const open = async (url: string) => {
    setBusy(true);
    try {
      const link = parseMusicLink(url);
      if (link && (link.kind === "playlist" || link.kind === "album")) {
        const ready = !!statuses.find((s) => s.id === link.provider)?.ready;
        const saved = await savePlaylistLink(link, ready);
        router.push(playlistPath(saved.playlist.id));
        await playTracks(saved.tracks);
        toast.success(
          saved.existed ? `"${saved.playlist.name}" is already in your library` : `Saved "${saved.playlist.name}" to your library`,
        );
        return true;
      }
      const r = await resolveLink(url);
      if (r.kind === "track") {
        await playTrack(r.track);
        toast.success(`Playing "${r.track.title}"`);
      } else {
        router.push(pathFor(r.kind, r.provider, r.id));
      }
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { open, busy };
}

export function LinkPlayer() {
  const [url, setUrl] = useState("");
  const { open, busy } = useOpenLink();
  return (
    <form
      className="flex flex-col gap-2 rounded-2xl border border-line bg-surface-2/50 p-4 sm:flex-row sm:items-center"
      onSubmit={async (e) => {
        e.preventDefault();
        if (url.trim() && (await open(url))) setUrl("");
      }}
    >
      <label className="flex flex-1 items-center gap-3">
        <Link2 className="size-5 shrink-0 text-muted" />
        <span className="sr-only">Music link</span>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a song or playlist link from YouTube, YouTube Music, Spotify, SoundCloud or Apple Music"
          className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-subtle"
          inputMode="url"
        />
      </label>
      <Button type="submit" variant="primary" disabled={busy || !url.trim()}>
        {busy ? <Spinner className="size-4" /> : <Play className="size-4 fill-current" />} Play link
      </Button>
    </form>
  );
}
