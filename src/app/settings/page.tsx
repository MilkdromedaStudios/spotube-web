"use client";

import clsx from "clsx";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Database, Download, ExternalLink, HardDrive, Keyboard, Palette, Play, Shield, Trash2, Upload, Wifi } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Page } from "@/components/Page";
import { ProviderBadge } from "@/components/ProviderBadge";
import { Button, Dialog, Notice, Spinner, Toggle } from "@/components/ui";
import { downloadJson, exportAll, importJson } from "@/lib/db/backup";
import { clearAllData, getDb, requestPersistentStorage, storageEstimate, useDbStatus } from "@/lib/db/db";
import { clearQueue } from "@/lib/player/engine";
import { useProviderStatuses } from "@/lib/providers";
import { useServerConfig } from "@/lib/providers/api";
import { authorizeApple, unauthorizeApple, useAppleAuth } from "@/lib/providers/apple";
import { disconnectSpotify, getUserToken, useSpotifyAuth } from "@/lib/providers/spotify";
import { ACCENTS, setSetting, useSettings, useSettingsStore, type Accent } from "@/lib/settings";
import { toast } from "@/lib/toast";
import { PROVIDER_IDS, PROVIDER_LABELS, type ProviderId } from "@/lib/types";
import { useUi } from "@/lib/uiStore";

function Card({ id, icon, title, children }: { id: string; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-2xl border border-line p-5">
      <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold [&>svg]:size-5 [&>svg]:text-accent">
        {icon} {title}
      </h2>
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}

function Row({ label, description, children }: { label: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const select = "h-9 rounded-full border border-line bg-surface-2 px-3 text-sm";

const bytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(2)} GB`;

function SpotifyAccount() {
  const spotifyRedirectUri = useServerConfig((s) => s.spotifyRedirectUri);
  const spotifyRedirectError = useServerConfig((s) => s.spotifyRedirectError);
  const cfg = useServerConfig((s) => s.providers);
  const auth = useSpotifyAuth();
  const settings = useSettings();
  if (!cfg.spotifyLogin)
    return (
      <p className="py-2 text-sm text-muted">
        Account connection needs SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET and SESSION_SECRET on the server.
      </p>
    );
  return (
    <>
      <Row
        label="Spotify account"
        description={
          auth.connected
            ? `Connected${auth.displayName ? ` as ${auth.displayName}` : ""}${auth.product ? ` · ${auth.product === "premium" ? "Premium" : "Free"}` : ""}. The sign-in is kept in an encrypted, HttpOnly cookie, never in IndexedDB.`
            : "Optional. Connect to see your Spotify playlists and, with Premium, play full tracks in this tab."
        }
      >
        {auth.connected ? (
          <Button size="sm" variant="outline" onClick={() => disconnectSpotify().then(() => toast.info("Spotify disconnected"))}>
            Disconnect
          </Button>
        ) : (
          <Button size="sm" variant="primary" onClick={() => (window.location.href = "/api/spotify/login")}>
            Connect Spotify
          </Button>
        )}
      </Row>
      <Row
        label="Spotify playback"
        description="Full tracks need a connected Premium account (Web Playback SDK). Otherwise Spotify's embed plays 30-second previews, or full tracks if you're signed in to Spotify in this browser."
      >
        <select
          className={select}
          value={settings.spotifyPlayback}
          onChange={(e) => setSetting("spotifyPlayback", e.target.value as "auto" | "embed")}
          aria-label="Spotify playback"
        >
          <option value="auto">Web Playback SDK when available</option>
          <option value="embed">Always use the Spotify embed</option>
        </select>
      </Row>
      <div className="mt-3 rounded-xl border border-line bg-surface-2 p-4">
        <p className="text-sm font-semibold">Spotify OAuth callback URL</p>
        {spotifyRedirectError && <Notice tone="warn">{spotifyRedirectError}</Notice>}
        {spotifyRedirectUri && (
          <div className="my-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg bg-surface px-3 py-2 text-xs">
              {spotifyRedirectUri}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(spotifyRedirectUri);
                  toast.success("Spotify callback URL copied");
                } catch {
                  toast.error("Select and copy the URL above.");
                }
              }}
            >
              Copy URL
            </Button>
          </div>
        )}
        <p className="text-xs text-muted">
          Add this exact URL to your Spotify Developer Dashboard in App Settings, under Redirect URIs, and save.
          It must match character for character. To use a fixed domain, set SPOTIFY_REDIRECT_URI to the same URL in Cloudflare Pages.
        </p>
      </div>
    </>
  );
}

function AppleAccount() {
  const cfg = useServerConfig((s) => s.providers);
  const authorized = useAppleAuth((s) => s.authorized);
  const settings = useSettings();
  const [busy, setBusy] = useState(false);
  const [sf, setSf] = useState(settings.appleStorefront);
  useEffect(() => setSf(settings.appleStorefront), [settings.appleStorefront]);
  if (!cfg.apple) return null;
  return (
    <>
      <Row
        label="Apple Music account"
        description="Optional. Subscribers can authorize MusicKit for full tracks; everyone else hears previews. MusicKit keeps its own sign-in token in this browser."
      >
        <Button
          size="sm"
          variant={authorized ? "outline" : "primary"}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              if (authorized) await unauthorizeApple();
              else await authorizeApple();
            } catch (e) {
              toast.error((e as Error).message || "Apple Music authorization failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy && <Spinner className="size-4" />} {authorized ? "Sign out of Apple Music" : "Sign in to Apple Music"}
        </Button>
      </Row>
      <Row label="Apple Music storefront" description="Two-letter country code used for catalog searches when you aren't signed in.">
        <input
          value={sf}
          maxLength={2}
          onChange={(e) => setSf(e.target.value.toLowerCase())}
          onBlur={() => /^[a-z]{2}$/.test(sf) && setSetting("appleStorefront", sf)}
          aria-label="Apple Music storefront"
          className="h-9 w-20 rounded-full border border-line bg-surface-2 px-3 text-center text-sm uppercase"
        />
      </Row>
    </>
  );
}

function Providers() {
  const settings = useSettings();
  const statuses = useProviderStatuses();
  return (
    <Card id="providers" icon={<Wifi />} title="Music providers">
      <p className="py-2 text-sm text-muted">
        Music always comes straight from each provider&apos;s official API and player. Nothing is copied to or streamed through this
        website&apos;s server.
      </p>
      {PROVIDER_IDS.map((id) => {
        const s = statuses.find((x) => x.id === id)!;
        return (
          <div key={id} className="py-1">
            <Toggle
              label={PROVIDER_LABELS[id]}
              checked={settings.enabledProviders[id]}
              onChange={(v) => setSetting("enabledProviders", { ...settings.enabledProviders, [id]: v })}
              description={
                <span className="flex items-center gap-2">
                  <ProviderBadge provider={id} />
                  {s.configured ? (
                    <span className="flex items-center gap-1 text-success">
                      <Check className="size-3.5" /> Search available
                    </span>
                  ) : (
                    <span>{s.reason}</span>
                  )}
                </span>
              }
            />
          </div>
        );
      })}
      <Row label="Preferred source" description="Used first on the Search page.">
        <select
          className={select}
          value={settings.preferredProvider}
          onChange={(e) => setSetting("preferredProvider", e.target.value as ProviderId)}
          aria-label="Preferred source"
        >
          {PROVIDER_IDS.map((id) => (
            <option key={id} value={id}>
              {PROVIDER_LABELS[id]}
            </option>
          ))}
        </select>
      </Row>
      <SpotifyAccount />
      <AppleAccount />
    </Card>
  );
}

function Storage() {
  const db = useDbStatus();
  const settings = useSettings();
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const counts = useLiveQuery(async () => {
    if (db.status !== "ready") return null;
    const d = getDb();
    const [playlists, tracks, likes, history] = await Promise.all([d.playlists.count(), d.tracks.count(), d.likes.count(), d.history.count()]);
    return { playlists, tracks, likes, history };
  }, [db.status]);
  const [confirmClear, setConfirmClear] = useState(false);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const file = useRef<HTMLInputElement>(null);
  const router = useRouter();
  useEffect(() => {
    storageEstimate().then(setEstimate).catch(() => {});
  }, [counts]);

  return (
    <Card id="storage" icon={<Database />} title="Storage & your data">
      <Notice>
        Your playlists, likes, history, queue and settings are saved in this browser&apos;s <strong>IndexedDB</strong>. There is no
        account and no server copy. That means they exist only on this browser and device, they do <strong>not</strong> sync to
        other devices, and they can be removed if you clear site data or the browser frees up space. Export a backup to keep them
        safe or move them.
      </Notice>
      <Row
        label="Database"
        description={
          db.status === "ready"
            ? counts
              ? `${counts.playlists} playlists · ${counts.likes} liked · ${counts.tracks} tracks · ${counts.history} plays`
              : "Ready"
            : db.status === "opening"
              ? "Opening…"
              : db.error
        }
      >
        <span className={clsx("text-sm", db.status === "ready" ? "text-success" : "text-danger")}>
          {db.status === "ready" ? "Working" : db.status === "opening" ? "…" : "Unavailable"}
        </span>
      </Row>
      {estimate && (
        <Row label="Space used" description={`Browser quota for this site: about ${bytes(estimate.quota)}`}>
          <span className="text-sm text-muted">{bytes(estimate.usage)}</span>
        </Row>
      )}
      <Row
        label="Persistent storage"
        description={
          db.persisted
            ? "Granted: the browser won't clear this data automatically when space runs low."
            : "Ask the browser not to evict your library when space runs low. Some browsers decide automatically."
        }
      >
        <Button
          size="sm"
          variant="outline"
          disabled={db.persisted}
          onClick={async () => {
            const ok = await requestPersistentStorage();
            await setSetting("requestPersistentStorage", true);
            toast[ok ? "success" : "info"](ok ? "Persistent storage granted" : "The browser declined for now. It may grant it as you use the site more.");
          }}
        >
          <HardDrive className="size-4" /> {db.persisted ? "Granted" : "Request"}
        </Button>
      </Row>
      <Row label="Export everything" description="Playlists (with covers), likes, saved albums and artists, collections, history and settings as one JSON file.">
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              downloadJson(`spotube-web-backup-${new Date().toISOString().slice(0, 10)}.json`, await exportAll());
              toast.success("Backup downloaded");
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        >
          <Download className="size-4" /> Export
        </Button>
      </Row>
      <Row label="Import" description="Restore a backup or a single exported playlist.">
        <div className="flex items-center gap-2">
          <select className={select} value={importMode} onChange={(e) => setImportMode(e.target.value as "merge" | "replace")} aria-label="Import mode">
            <option value="merge">Merge with my library</option>
            <option value="replace">Replace my library</option>
          </select>
          <Button size="sm" variant="outline" onClick={() => file.current?.click()}>
            <Upload className="size-4" /> Import
          </Button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                const r = await importJson(await f.text(), { replace: importMode === "replace" });
                await useSettingsStore.getState().load();
                toast.success(
                  r.kind === "playlist" ? `Imported a playlist with ${r.tracks} tracks` : `Imported ${r.playlists} playlists, ${r.likes} likes, ${r.tracks} tracks`,
                );
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
          />
        </div>
      </Row>
      <Row label="Clear all app data" description="Deletes everything Spotube Web stored in this browser. This can't be undone.">
        <Button size="sm" variant="danger" onClick={() => setConfirmClear(true)}>
          <Trash2 className="size-4" /> Clear data
        </Button>
      </Row>
      <Toggle
        label="Request persistent storage automatically"
        description="Ask for persistent storage every time the site opens."
        checked={settings.requestPersistentStorage}
        onChange={(v) => setSetting("requestPersistentStorage", v)}
      />
      <Dialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear all app data?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                clearQueue();
                await disconnectSpotify().catch(() => {});
                await clearAllData();
                await useSettingsStore.getState().load();
                setConfirmClear(false);
                toast.success("All app data cleared");
                router.push("/");
              }}
            >
              Delete everything
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Your playlists, liked songs, saved albums and artists, collections, listening history, queue and settings will be deleted from
          this browser. Consider exporting a backup first.
        </p>
      </Dialog>
    </Card>
  );
}

function SettingsInner() {
  const settings = useSettings();
  const params = useSearchParams();
  useEffect(() => {
    const s = params.get("spotify");
    if (!s) return;
    if (s === "connected") {
      void getUserToken(true);
      toast.success("Spotify connected");
    } else if (s === "denied") toast.info("Spotify connection was cancelled");
    else toast.error("Spotify connection failed. Check the redirect URI and credentials, then try again.");
    window.history.replaceState(null, "", "/settings#providers");
  }, [params]);

  return (
    <Page title="Settings">
      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Settings sections">
        {[
          ["providers", "Providers"],
          ["playback", "Playback"],
          ["privacy", "Privacy"],
          ["appearance", "Appearance"],
          ["storage", "Storage"],
          ["about", "About"],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-full bg-surface-2 px-3 py-1 hover:bg-surface-3">
            {label}
          </a>
        ))}
      </nav>

      <Providers />

      <Card id="playback" icon={<Play />} title="Playback">
        <Toggle label="Autoplay next track" description="Continue with the next song in the queue when one ends." checked={settings.autoplayNext} onChange={(v) => setSetting("autoplayNext", v)} />
        <Toggle label="Skip unplayable tracks" description="If a provider can't play a track, move on to the next one after a short pause." checked={settings.skipOnError} onChange={(v) => setSetting("skipOnError", v)} />
        <Toggle label="Resume long tracks" description="Remember the position in tracks over 10 minutes (mixes, podcasts, live sets)." checked={settings.resumeLongTracks} onChange={(v) => setSetting("resumeLongTracks", v)} />
        <Toggle
          label="Browser and system media controls"
          description="Show the current song on the lock screen / media hub and use hardware media keys (Media Session API)."
          checked={settings.mediaSession}
          onChange={(v) => setSetting("mediaSession", v)}
        />
      </Card>

      <Card id="privacy" icon={<Shield />} title="Privacy & ads">
        <Notice>
          Spotube Web shows no ads and runs no analytics, trackers or third-party cookies of its own. A strict Content Security Policy
          lets the browser load scripts and frames only from the official YouTube, Spotify, SoundCloud and Apple Music players, so other
          third-party scripts are blocked. Provider SDKs load only when you use that provider. <br />
          <br />
          External services may show their own ads <strong>inside their official players</strong> (for example YouTube, SoundCloud and
          Spotify Free). Spotube Web does not block, skip or hide those ads, because that would break the providers&apos; terms.
        </Notice>
        <Toggle
          label="YouTube privacy-enhanced mode"
          description="Embed YouTube from youtube-nocookie.com, which doesn't store cookies until you play a video."
          checked={settings.youtubePrivacyMode}
          onChange={(v) => setSetting("youtubePrivacyMode", v)}
        />
        <Toggle
          label="Load artwork"
          description="Album art is fetched directly from provider image servers without a referrer. Turn off to make no image requests at all."
          checked={settings.loadArtwork}
          onChange={(v) => setSetting("loadArtwork", v)}
        />
        <Toggle
          label="Record listening history"
          description="Keep recently played tracks and stats in this browser. Turning it off stops new entries; clear old ones in Library → Recently played."
          checked={settings.recordHistory}
          onChange={(v) => setSetting("recordHistory", v)}
        />
        <Toggle
          label="Explain provider ads"
          description="Show a note in the player when the current provider may show its own ads."
          checked={settings.showAdNotices}
          onChange={(v) => setSetting("showAdNotices", v)}
        />
        {PROVIDER_IDS.filter((p) => !settings.enabledProviders[p]).length > 0 && (
          <p className="py-3 text-sm text-muted">
            Turned-off providers never load their scripts: {PROVIDER_IDS.filter((p) => !settings.enabledProviders[p]).map((p) => PROVIDER_LABELS[p]).join(", ")}.
          </p>
        )}
      </Card>

      <Card id="appearance" icon={<Palette />} title="Appearance">
        <Row label="Theme">
          <select className={select} value={settings.theme} onChange={(e) => setSetting("theme", e.target.value as "dark" | "light" | "system")} aria-label="Theme">
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="system">Match system</option>
          </select>
        </Row>
        <Row label="Accent color">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Accent color">
            {(Object.keys(ACCENTS) as Accent[]).map((a) => (
              <button
                key={a}
                role="radio"
                aria-checked={settings.accent === a}
                aria-label={ACCENTS[a].label}
                title={ACCENTS[a].label}
                onClick={() => setSetting("accent", a)}
                className={clsx("size-7 rounded-full ring-offset-2 ring-offset-bg", settings.accent === a && "ring-2 ring-fg")}
                style={{ background: ACCENTS[a].color }}
              />
            ))}
          </div>
        </Row>
        <Toggle label="Compact track lists" checked={settings.compactLists} onChange={(v) => setSetting("compactLists", v)} />
        <Toggle label="Reduce motion" checked={settings.reduceMotion} onChange={(v) => setSetting("reduceMotion", v)} />
      </Card>

      <Storage />

      <Card id="about" icon={<Keyboard />} title="About">
        <Row label="Keyboard shortcuts" description="Press ? anywhere to see them.">
          <Button size="sm" variant="outline" onClick={() => useUi.setState({ shortcutsOpen: true })}>
            Show shortcuts
          </Button>
        </Row>
        <div className="py-3 text-sm text-muted">
          <p>
            Spotube Web is a browser version of{" "}
            <a href="https://github.com/KRTirtho/spotube" className="inline-flex items-center gap-1 underline" target="_blank" rel="noreferrer">
              Spotube <ExternalLink className="size-3" />
            </a>
            . This product includes software developed by Kingkor Roy Tirtho.
          </p>
          <p className="mt-2">
            Copyright (c) 2025 Kingkor Roy Tirtho. All rights reserved. Distributed under the BSD-4-Clause License. Spotube Web is not
            affiliated with or endorsed by YouTube, Spotify, SoundCloud or Apple.
          </p>
          <p className="mt-2">
            <Link href="/licenses" className="underline">
              License and notices
            </Link>
          </p>
        </div>
      </Card>
    </Page>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsInner />
    </Suspense>
  );
}
