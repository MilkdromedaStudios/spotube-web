"use client";

import clsx from "clsx";
import { Link2, Search as SearchIcon, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { AlbumCard, ArtistCard, CardGrid, PlaylistCard, Section } from "@/components/Cards";
import { useOpenLink } from "@/components/LinkPlayer";
import { Page } from "@/components/Page";
import { TrackList } from "@/components/TrackList";
import { Button, EmptyState, ErrorState, LoadingState, Notice, Spinner } from "@/components/ui";
import { searchLibrary } from "@/lib/db/library";
import { useDbStatus } from "@/lib/db/db";
import { providers, useProviderStatuses } from "@/lib/providers";
import { looksLikeLink } from "@/lib/providers/links";
import { useSettings } from "@/lib/settings";
import { emptyResults, isProviderId, type ProviderId, type SearchResults, type SearchType, type Track } from "@/lib/types";

const FILTERS: { id: "all" | SearchType; label: string }[] = [
  { id: "all", label: "All" },
  { id: "tracks", label: "Songs" },
  { id: "albums", label: "Albums" },
  { id: "artists", label: "Artists" },
  { id: "playlists", label: "Playlists" },
];

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function SearchInner() {
  const params = useSearchParams();
  const router = useRouter();
  const settings = useSettings();
  const statuses = useProviderStatuses();
  const dbReady = useDbStatus((s) => s.status === "ready");
  const [input, setInput] = useState(params.get("q") ?? "");
  const q = useDebounced(input.trim(), 450);
  const provParam = params.get("provider");
  const provider: ProviderId | "library" =
    provParam === "library" ? "library" : isProviderId(provParam) ? provParam : settings.preferredProvider;
  const filter = (FILTERS.find((f) => f.id === params.get("type"))?.id ?? "all") as "all" | SearchType;
  const status = provider === "library" ? null : statuses.find((s) => s.id === provider)!;
  const isLink = looksLikeLink(q);
  const { open, busy: opening } = useOpenLink();

  // Keep the URL in sync so results are shareable and survive refresh.
  useEffect(() => {
    const sp = new URLSearchParams(params.toString());
    if (q) sp.set("q", q);
    else sp.delete("q");
    const next = `/search${sp.size ? `?${sp}` : ""}`;
    if (next !== `/search${params.size ? `?${params}` : ""}`) router.replace(next, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const setParam = (k: string, v: string) => {
    const sp = new URLSearchParams(params.toString());
    sp.set(k, v);
    router.replace(`/search?${sp}`, { scroll: false });
  };

  const [results, setResults] = useState<SearchResults>(emptyResults());
  const [nextPage, setNextPage] = useState<string | number | undefined>();
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string>();
  const [local, setLocal] = useState<Track[]>([]);
  const [nonce, setNonce] = useState(0);

  const types: SearchType[] = useMemo(() => {
    const all: SearchType[] = provider === "youtube" ? ["tracks", "playlists", "artists"] : ["tracks", "albums", "artists", "playlists"];
    return filter === "all" ? all : [filter];
  }, [filter, provider]);

  useEffect(() => {
    if (!dbReady || !q || isLink) return setLocal([]);
    let alive = true;
    searchLibrary(q, provider === "library" ? 200 : 5)
      .then((r) => alive && setLocal(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [q, dbReady, isLink, provider]);

  useEffect(() => {
    setResults(emptyResults());
    setNextPage(undefined);
    setError(undefined);
    if (!q || isLink || provider === "library" || !status?.ready) return;
    let alive = true;
    setLoading(true);
    providers[provider]
      .search(q, types)
      .then((r) => {
        if (!alive) return;
        setResults(r);
        setNextPage(r.next);
      })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, provider, types, status?.ready, isLink, nonce]);

  const loadMore = async () => {
    if (nextPage === undefined || provider === "library") return;
    setLoadingMore(true);
    try {
      const r = await providers[provider].search(q, types, nextPage);
      const merge = <T extends { key: string }>(a: T[], b: T[]) => {
        const seen = new Set(a.map((x) => x.key));
        return [...a, ...b.filter((x) => !seen.has(x.key))];
      };
      setResults((prev) => ({
        tracks: merge(prev.tracks, r.tracks),
        albums: merge(prev.albums, r.albums),
        artists: merge(prev.artists, r.artists),
        playlists: merge(prev.playlists, r.playlists),
      }));
      setNextPage(r.next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  const nothing =
    !loading && !error && q && !isLink && provider !== "library" && status?.ready &&
    !results.tracks.length && !results.albums.length && !results.artists.length && !results.playlists.length;

  return (
    <Page>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (isLink) void open(input);
        }}
        className="flex items-center gap-3 rounded-full border border-line bg-surface-2 px-4 focus-within:border-accent"
      >
        <SearchIcon className="size-5 text-muted" />
        <input
          id="search-input"
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="What do you want to listen to? Or paste a link"
          aria-label="Search music"
          className="h-12 flex-1 bg-transparent outline-none placeholder:text-subtle"
        />
        {input && (
          <button type="button" aria-label="Clear search" onClick={() => setInput("")} className="text-muted hover:text-fg">
            <X className="size-5" />
          </button>
        )}
      </form>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Source">
          {statuses.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={provider === s.id}
              onClick={() => setParam("provider", s.id)}
              title={s.reason}
              className={clsx(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                provider === s.id ? "bg-fg text-bg" : "bg-surface-2 hover:bg-surface-3",
                !s.ready && "opacity-60",
              )}
            >
              {s.label}
            </button>
          ))}
          <button
            role="tab"
            aria-selected={provider === "library"}
            onClick={() => setParam("provider", "library")}
            className={clsx(
              "rounded-full px-4 py-1.5 text-sm font-medium",
              provider === "library" ? "bg-fg text-bg" : "bg-surface-2 hover:bg-surface-3",
            )}
          >
            Your library
          </button>
        </div>
        {provider !== "library" && (
          <div className="flex flex-wrap gap-2" aria-label="Result type">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setParam("type", f.id)}
                aria-pressed={filter === f.id}
                disabled={provider === "youtube" && f.id === "albums"}
                title={provider === "youtube" && f.id === "albums" ? "The YouTube Data API has no album search" : undefined}
                className={clsx(
                  "rounded-full border px-3 py-1 text-xs font-medium disabled:opacity-40",
                  filter === f.id ? "border-accent text-accent" : "border-line text-muted hover:text-fg",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {isLink && (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-line p-4 sm:flex-row sm:items-center">
          <Link2 className="size-5 text-muted" />
          <p className="flex-1 text-sm">That looks like a music link. Open it to play it or view it here.</p>
          <Button variant="primary" onClick={() => open(input)} disabled={opening}>
            {opening && <Spinner className="size-4" />} Open link
          </Button>
        </div>
      )}

      {!q && (
        <EmptyState icon={<SearchIcon className="size-8" />} title="Search for music">
          Results come straight from the provider you pick. Songs you save go to your library in this browser.
        </EmptyState>
      )}

      {status && !status.ready && q && !isLink && <Notice tone="warn">{status.reason}</Notice>}

      {local.length > 0 && (
        <Section title={provider === "library" ? `In your library (${local.length})` : "In your library"}>
          <TrackList tracks={local} />
        </Section>
      )}
      {provider === "library" && q && !local.length && dbReady && (
        <EmptyState title="Nothing in your library matches">Try searching a provider instead.</EmptyState>
      )}

      {error && <ErrorState title="Search failed" message={error} onRetry={() => setNonce((n) => n + 1)} />}
      {loading && <LoadingState label="Searching…" />}
      {nothing && <EmptyState title={`No results for “${q}”`}>Check the spelling or try another provider.</EmptyState>}

      {results.tracks.length > 0 && (
        <Section title="Songs">
          <TrackList tracks={filter === "all" ? results.tracks.slice(0, 10) : results.tracks} />
        </Section>
      )}
      {results.artists.length > 0 && (
        <Section title="Artists">
          <CardGrid>
            {results.artists.map((a) => (
              <ArtistCard key={a.key} artist={a} />
            ))}
          </CardGrid>
        </Section>
      )}
      {results.albums.length > 0 && (
        <Section title="Albums">
          <CardGrid>
            {results.albums.map((a) => (
              <AlbumCard key={a.key} album={a} />
            ))}
          </CardGrid>
        </Section>
      )}
      {results.playlists.length > 0 && (
        <Section title="Playlists">
          <CardGrid>
            {results.playlists.map((p) => (
              <PlaylistCard key={p.key} playlist={p} />
            ))}
          </CardGrid>
        </Section>
      )}
      {filter !== "all" && nextPage !== undefined && !loading && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore && <Spinner className="size-4" />} Load more
          </Button>
        </div>
      )}
    </Page>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <SearchInner />
    </Suspense>
  );
}
