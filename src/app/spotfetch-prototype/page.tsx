"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Download, ExternalLink, FileAudio, Music, Search } from "lucide-react";
import { Page } from "@/components/Page";
import { Button, Notice, Spinner } from "@/components/ui";
import { safeMp3Name, tagLocalMp3 } from "@/lib/audio/localMp3";
import { spTrackToTrack, type SpTrack } from "@/lib/providers/mappers/spotify";
import { spGet } from "@/lib/providers/spotify";
import type { Track } from "@/lib/types";

function parseSpotifyTrackId(input: string): string | null {
  const value = input.trim();
  if (/^[A-Za-z0-9]{22}$/.test(value)) return value;
  const uri = /^spotify:track:([A-Za-z0-9]{22})$/.exec(value);
  if (uri) return uri[1];
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "open.spotify.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    // Spotify may prepend a locale, e.g. /intl-en/track/...
    if (parts[0]?.startsWith("intl-")) parts.shift();
    return parts.length === 2 && parts[0] === "track" && /^[A-Za-z0-9]{22}$/.test(parts[1])
      ? parts[1] : null;
  } catch {
    return null;
  }
}

/**
 * Independent metadata-to-MP3 experiment, inspired by the SpotFetch project.
 * Spotify is queried for track information only. Users must supply their own
 * MP3; neither Spotify nor YouTube audio is downloaded by this page.
 */
export default function SpotFetchPrototypePage() {
  const [link, setLink] = useState("");
  const [track, setTrack] = useState<Track | null>(null);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [album, setAlbum] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = parseSpotifyTrackId(link);
    if (!id) {
      setError("Paste an open.spotify.com/track/... link, Spotify track URI, or 22-character track ID.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const raw = await spGet<SpTrack>("/v1/tracks/" + id);
      const item = spTrackToTrack(raw);
      if (!item || !item.title) throw new Error("No track information returned for this link.");
      setTrack(item);
      setTitle(item.title);
      setArtist(item.artists.map((a) => a.name).filter(Boolean).join(", "));
      setAlbum(item.album?.name ?? "");
      setNotice("Spotify track information loaded. Select an MP3 you own or have permission to modify.");
    } catch (err) {
      setTrack(null);
      setError(err instanceof Error ? err.message : "Couldn't load Spotify track information.");
    } finally {
      setBusy(false);
    }
  }

  async function saveMp3() {
    if (!file) {
      setError("Choose an MP3 file that you have permission to use.");
      return;
    }
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const blob = await tagLocalMp3(file, { title, artist, album });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = safeMp3Name(title, artist);
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 3000);
      setNotice("Tagged MP3 prepared for download. Audio frames were not transcoded or sent to any server.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't tag the MP3.");
    } finally {
      setSaving(false);
    }
  }

  const field = "w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-accent";
  return (
    <Page title="MP3 metadata lab · Prototype" className="max-w-5xl">
      <Notice tone="warn">
        This does not extract audio from Spotify. Spotify supplies only track information;
        the MP3 comes from a file you choose on your device. Spotify prohibits stream ripping.
        Files are processed locally in your browser.
      </Notice>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">
          <Search className="size-5 text-accent" /> 1. Identify a Spotify song
        </h2>
        <p className="mb-4 text-sm text-muted">No Spotify account connection needed. Uses the existing public catalogue metadata integration.</p>
        <form onSubmit={lookup} className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor="spotify-track-input" className="sr-only">Spotify track URL or ID</label>
          <input
            id="spotify-track-input"
            className={field + " min-w-0 flex-1"}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://open.spotify.com/track/..."
            autoComplete="off"
            spellCheck={false}
          />
          <Button variant="primary" type="submit" disabled={busy || !link.trim()}>
            {busy ? <Spinner className="size-4" /> : <Music className="size-4" />} Load song
          </Button>
        </form>
        {track && (
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Spotify catalogue result</p>
              <p className="mt-1 break-words text-xl font-semibold">{track.title}</p>
              <p className="text-sm text-muted">{track.artists.map((a) => a.name).join(", ")}</p>
              <p className="text-sm text-muted">{track.album?.name}</p>
              <a
                className="mt-3 inline-flex items-center gap-1 text-sm text-accent hover:underline"
                href={track.url ?? "https://open.spotify.com/track/" + track.id}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on Spotify <ExternalLink className="size-4" />
              </a>
            </div>
            <iframe
              title={"Spotify player for " + track.title}
              src={"https://open.spotify.com/embed/track/" + encodeURIComponent(track.id)}
              className="h-[152px] w-full rounded-xl border-0"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
            />
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">
          <FileAudio className="size-5 text-accent" /> 2. Select your own MP3
        </h2>
        <p className="mb-4 text-sm text-muted">
          Choose a locally stored MP3 that you created, own, or have permission to modify.
          No upload takes place. You can also try this without first looking up Spotify information.
        </p>
        <label htmlFor="mp3-file-input" className="mb-2 block text-sm font-medium">Your MP3 file</label>
        <input
          id="mp3-file-input"
          type="file"
          accept=".mp3,audio/mpeg"
          className="block w-full rounded-xl border border-line bg-surface-2 p-3 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-surface-3 file:px-3 file:py-2 file:text-fg"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {file && <p className="mt-2 text-xs text-muted">{file.name} · {(file.size / (1024 * 1024)).toFixed(2)} MB</p>}
        {previewUrl && (
          <audio controls preload="metadata" src={previewUrl} className="mt-4 w-full">
            Your browser cannot play this MP3.
          </audio>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <Download className="size-5 text-accent" /> 3. Tag and download a copy
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="mp3-title" className="mb-1 block text-sm font-medium">Track title</label>
            <input id="mp3-title" className={field} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </div>
          <div>
            <label htmlFor="mp3-artist" className="mb-1 block text-sm font-medium">Artist</label>
            <input id="mp3-artist" className={field} value={artist} onChange={(e) => setArtist(e.target.value)} maxLength={200} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="mp3-album" className="mb-1 block text-sm font-medium">Album (optional)</label>
            <input id="mp3-album" className={field} value={album} onChange={(e) => setAlbum(e.target.value)} maxLength={200} />
          </div>
        </div>
        <p className="my-3 text-xs text-muted">
          The prototype writes ID3v2.4 title, artist and album fields. Existing ID3v2 tags,
          including embedded artwork or lyrics, will be replaced. The original MP3 stays unchanged.
        </p>
        <Button variant="primary" onClick={() => void saveMp3()} disabled={saving || !file || !title.trim() || !artist.trim()}>
          {saving ? <Spinner className="size-4" /> : <Download className="size-4" />} Download tagged MP3
        </Button>
      </section>

      {(error || notice) && (
        <div role={error ? "alert" : "status"} className={"rounded-xl border p-3 text-sm " + (error ? "border-danger/40 text-danger" : "border-line text-muted")}>
          {error || notice}
        </div>
      )}

      <section className="rounded-2xl border border-line bg-surface-2 p-4 text-sm text-muted">
        <h2 className="mb-2 font-semibold text-fg">Credits & licensing</h2>
        <p>
          Workflow inspiration:{" "}
          <a className="text-accent underline" href="https://github.com/MrElyazid/SpotFetch" target="_blank" rel="noopener noreferrer">
            SpotFetch by MrElyazid
          </a>, licensed under GPL-2.0-or-later. SpotFetch uses Spotify playlist metadata and
          YouTube/YouTube Music as its audio source. This is an independently written
          metadata-tagging demonstration, not a fork; no GPL implementation was copied.
        </p>
        <p className="mt-2">
          Spotify and its marks belong to Spotify AB. Song data links back to Spotify.
          This prototype does not download Spotify tracks, extract protected streams,
          or download third-party YouTube audio. Use only audio for which you have the necessary rights.
        </p>
      </section>
    </Page>
  );
}
