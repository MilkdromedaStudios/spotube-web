"use client";

import { ArrowLeft, Check, Link2, ListMusic, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Page } from "@/components/Page";
import { Button, Notice, LoadingState } from "@/components/ui";
import { useDbStatus } from "@/lib/db/db";
import { createPlaylist } from "@/lib/db/library";
import { providers, resolveLink, useProviderStatuses } from "@/lib/providers";
import { parseMusicLink } from "@/lib/providers/links";
import { getUserToken, spGet, useSpotifyAuth } from "@/lib/providers/spotify";
import { toast } from "@/lib/toast";
import { artistNames, PROVIDER_LABELS, type ProviderId, type Track } from "@/lib/types";

interface ImportCandidate {
  key: string;
  provider: ProviderId;
  id: string;
  url: string;
  name: string;
  artwork?: string;
  tracks: Track[];
  selected: string[];
  include: boolean;
}

export default function ImportPlaylistsPage() {
  const router = useRouter();
  const spotifyConnected = useSpotifyAuth((s) => s.connected);
  const status = useDbStatus();
  const providersStatus = useProviderStatuses();
  const ready = new Set(providersStatus.filter((p) => p.ready).map((p) => p.id));
  const [input, setInput] = useState("");
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [spotifyLists, setSpotifyLists] = useState<{ id: string; name: string }[]>([]);
  const [spotifySelected, setSpotifySelected] = useState<string[]>([]);

  function edit(key: string, update: (item: ImportCandidate) => ImportCandidate) {
    setCandidates((prev) => prev.map((item) => item.key === key ? update(item) : item));
  }

  async function browseSpotify() {
    setSpotifyLoading(true);
    try {
      if (!(await getUserToken())) throw new Error("Connect your Spotify account in Settings first.");
      const all: { id: string; name: string }[] = [];
      for (let offset = 0; offset < 150; offset += 50) {
        const page = await spGet<{ items: { id: string; name: string }[]; next?: string | null }>("/v1/me/playlists", { limit: 50, offset });
        all.push(...page.items.filter((item) => item && item.id));
        if (!page.next || page.items.length < 50) break;
      }
      setSpotifyLists(all);
      setSpotifySelected([]);
      if (!all.length) setErrors(["Your Spotify account returned no accessible playlists. You can still paste links."]);
      else setErrors([]);
    } catch (e) {
      setErrors(["Spotify: " + ((e as Error).message || "Couldn't list your playlists")]);
    } finally {
      setSpotifyLoading(false);
    }
  }

  async function preview(linksText: string = input) {
    const raw = [...new Set(linksText.split(/[\r\n,]+/).map((s) => s.trim()).filter(Boolean))];
    if (!raw.length) {
      setErrors(["Paste at least one playlist link."]);
      return;
    }
    if (raw.length > 10) {
      setErrors(["Load up to 10 playlists at a time to avoid provider API limits."]);
      return;
    }
    setLoading(true);
    setCandidates([]);
    setErrors([]);
    setSavedCount(0);
    const loaded: ImportCandidate[] = [];
    const failures: string[] = [];
    const visited = new Set<string>();
    for (const url of raw) {
      const parsed = parseMusicLink(url);
      if (!parsed || parsed.kind !== "playlist") {
        failures.push("Not a recognized playlist URL: " + url);
        continue;
      }
      if (!ready.has(parsed.provider)) {
        // Without the provider's API the whole playlist becomes one item that plays in the provider's own player.
        try {
          const resolved = await resolveLink(parsed.url);
          if (resolved.kind !== "track") throw new Error(PROVIDER_LABELS[parsed.provider] + " needs to be enabled and configured in Settings.");
          const key = parsed.provider + ":" + parsed.id;
          if (visited.has(key)) continue;
          visited.add(key);
          loaded.push({
            key,
            provider: parsed.provider,
            id: parsed.id,
            url: parsed.url,
            name: resolved.track.title,
            artwork: resolved.track.artwork,
            tracks: [resolved.track],
            selected: [resolved.track.key],
            include: true,
          });
        } catch (error) {
          failures.push(PROVIDER_LABELS[parsed.provider] + ": " + ((error as Error).message || "Could not load playlist"));
        }
        continue;
      }
      try {
        // SoundCloud share links use a permalink; resolve it to the numeric playlist ID.
        let id = parsed.id;
        if (parsed.provider === "soundcloud") {
          const resolved = await resolveLink(parsed.url);
          if (resolved.kind !== "playlist" || resolved.provider !== "soundcloud") {
            throw new Error("This link is not a SoundCloud playlist.");
          }
          id = resolved.id;
        }
        const key = parsed.provider + ":" + id;
        if (visited.has(key)) continue;
        visited.add(key);
        const result = await providers[parsed.provider].playlist(id);
        const tracks = Array.from(new Map(result.tracks.map((t) => [t.key, t])).values());
        if (!tracks.length) {
          failures.push("No accessible songs in " + (result.playlist?.name || url) + ".");
          continue;
        }
        loaded.push({
          key,
          provider: parsed.provider,
          id,
          url: parsed.url,
          name: result.playlist.name,
          artwork: result.playlist.artwork,
          tracks,
          selected: tracks.map((t) => t.key),
          include: true,
        });
      } catch (error) {
        failures.push(PROVIDER_LABELS[parsed.provider] + ": " + ((error as Error).message || "Could not load playlist"));
      }
    }
    setCandidates(loaded);
    setErrors(failures);
    setLoading(false);
  }

  async function save() {
    if (status.status !== "ready" || saving) return;
    const chosen = candidates.filter((c) => c.include && c.selected.length > 0);
    if (!chosen.length) return;
    setSaving(true);
    setErrors([]);
    let imported = 0;
    const failures: string[] = [];
    for (const candidate of chosen) {
      try {
        const selected = new Set(candidate.selected);
        await createPlaylist({
          name: candidate.name,
          artwork: candidate.artwork,
          tracks: candidate.tracks.filter((t) => selected.has(t.key)),
          source: { provider: candidate.provider, id: candidate.id, url: candidate.url },
        });
        imported++;
      } catch (e) {
        failures.push(candidate.name + ": " + ((e as Error).message || "Could not save"));
      }
    }
    setSavedCount(imported);
    setErrors(failures);
    setSaving(false);
    if (imported) {
      toast.success("Imported " + imported + " playlist" + (imported === 1 ? "" : "s") + " into your library");
      if (!failures.length) router.push("/library?tab=playlists");
    }
  }

  const count = candidates.filter((c) => c.include && c.selected.length).length;

  return (
    <Page title="Import playlists">
      <div className="flex max-w-3xl flex-col gap-5">
        <Link href="/library" className="inline-flex w-fit items-center gap-2 text-sm text-muted hover:text-fg">
          <ArrowLeft className="size-4" /> Back to Library
        </Link>
        <section className="flex flex-col gap-3 rounded-2xl border border-line p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Link2 className="size-5" /> Import from music services</h2>
          <p className="text-sm text-muted">
            Paste public or accessible Spotify, YouTube / YouTube Music, SoundCloud, or Apple Music playlist links.
            Add one link per line, up to 10 at a time. We copy song information, not audio files.
          </p>
          <label htmlFor="playlist-links" className="text-sm font-medium">Playlist links</label>
          <textarea
            id="playlist-links"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={4}
            spellCheck={false}
            placeholder={"https://open.spotify.com/playlist/...\nhttps://www.youtube.com/playlist?list=..."}
            className="w-full rounded-xl border border-line bg-surface-2 p-3 text-sm outline-none focus:border-accent"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={() => void preview()} disabled={loading || saving || !input.trim()}>
              <ListMusic className="size-4" /> {loading ? "Loading playlists…" : "Preview playlists"}
            </Button>
            <span className="text-xs text-muted">Private playlists require the source's supported authorization.</span>
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-line p-5">
          <h2 className="text-lg font-semibold">Or choose from your Spotify account</h2>
          <p className="text-sm text-muted">If Spotify is connected, browse your own and followed playlists, then choose which ones to import.</p>
          {spotifyConnected ? (
            <Button variant="outline" disabled={spotifyLoading || loading || saving} onClick={() => void browseSpotify()}>
              {spotifyLoading ? "Loading Spotify playlists…" : "Browse my Spotify playlists"}
            </Button>
          ) : (
            <Link href="/settings#providers" className="text-sm text-accent underline">Connect Spotify in Settings</Link>
          )}
          {spotifyLists.length > 0 && (
            <>
              <p className="text-sm text-muted">{spotifySelected.length} of {spotifyLists.length} playlists selected</p>
              <div className="max-h-60 divide-y divide-line overflow-y-auto">
                {spotifyLists.map((item) => (
                  <label key={item.id} className="flex cursor-pointer items-center gap-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={spotifySelected.includes(item.id)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSpotifySelected((prev) => checked ? [...prev, item.id] : prev.filter((id) => id !== item.id));
                      }}
                    />
                    <span>{item.name}</span>
                  </label>
                ))}
              </div>
              <Button variant="outline" disabled={!spotifySelected.length || loading} onClick={() => {
                const urls = spotifySelected.map((id) => "https://open.spotify.com/playlist/" + id);
                const all = [input, ...urls].filter(Boolean).join("\n");
                setInput(all);
                void preview(all);
              }}>
                Preview selected Spotify playlists
              </Button>
              <p className="text-xs text-muted">Up to 10 playlist links can be previewed at once. Spotify may restrict some playlists or tracks.</p>
            </>
          )}
        </section>

        {status.status !== "ready" && (
          <Notice tone="warn">{status.error || "Waiting for browser storage before importing."}</Notice>
        )}
        {loading && <LoadingState label="Fetching playlist details and tracks…" />}
        {errors.length > 0 && (
          <Notice tone="warn">
            <p className="font-medium">Some playlists could not be processed:</p>
            <ul className="mt-2 list-inside list-disc">
              {errors.map((message, i) => <li key={i}>{message}</li>)}
            </ul>
          </Notice>
        )}
        {savedCount > 0 && <Notice>Saved {savedCount} playlists. <Link href="/library" className="underline">View library</Link></Notice>}

        {candidates.length > 0 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Choose playlists and songs</h2>
                <p className="text-sm text-muted">Deselect whole playlists or individual songs. Existing playlists are not overwritten.</p>
              </div>
              <Button variant="primary" disabled={saving || status.status !== "ready" || count === 0} onClick={() => void save()}>
                <Upload className="size-4" /> {saving ? "Importing…" : "Import " + count + " playlist" + (count === 1 ? "" : "s")}
              </Button>
            </div>
            {candidates.map((item) => {
              const selectedSet = new Set(item.selected);
              return (
                <section key={item.key} className="overflow-hidden rounded-2xl border border-line">
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-2 p-4">
                    <label className="flex min-w-0 items-center gap-3">
                      <input
                        type="checkbox"
                        checked={item.include}
                        onChange={(e) => edit(item.key, (p) => ({ ...p, include: e.target.checked }))}
                        className="size-4 accent-accent"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{item.name}</span>
                        <span className="block text-xs text-muted">{PROVIDER_LABELS[item.provider]} · {item.selected.length} of {item.tracks.length} songs selected</span>
                      </span>
                    </label>
                    <div className="flex items-center gap-2">
                      <button type="button" className="text-xs text-accent hover:underline" onClick={() => edit(item.key, (p) => ({ ...p, selected: p.tracks.map((t) => t.key), include: true }))}>Select all</button>
                      <button type="button" className="text-xs text-muted hover:underline" onClick={() => edit(item.key, (p) => ({ ...p, selected: [] }))}>Select none</button>
                    </div>
                  </div>
                  <div className="max-h-80 divide-y divide-line overflow-y-auto px-4">
                    {item.tracks.map((track) => (
                      <label key={track.key} className="flex cursor-pointer items-center gap-3 py-2 text-sm hover:text-accent">
                        <input
                          type="checkbox"
                          className="size-4 shrink-0 accent-accent"
                          disabled={!item.include}
                          checked={selectedSet.has(track.key)}
                          onChange={(e) => edit(item.key, (p) => ({
                            ...p,
                            selected: e.target.checked ? [...p.selected, track.key] : p.selected.filter((k) => k !== track.key),
                          }))}
                        />
                        <span className="min-w-0">
                          <span className="block truncate">{track.title}</span>
                          <span className="block truncate text-xs text-muted">{artistNames(track)}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              );
            })}
            <Button variant="primary" disabled={saving || status.status !== "ready" || count === 0} onClick={() => void save()}>
              <Check className="size-4" /> {saving ? "Importing…" : "Save selected playlists"}
            </Button>
          </div>
        )}
        <p className="text-xs text-muted">
          This creates local copies in IndexedDB. It does not move your streaming account, bypass provider restrictions,
          sync future playlist changes, or download music. You can still import Spotube JSON backups from Your Library.
        </p>
      </div>
    </Page>
  );
}
