"use client";

import clsx from "clsx";
import { BarChart3, Heart, Home, Library, ListMusic, Plus, Search, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Artwork } from "@/components/Artwork";
import { usePlaylists } from "@/hooks/useLibrary";
import { createPlaylist } from "@/lib/db/library";
import { toast } from "@/lib/toast";

export const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/search", label: "Search", icon: Search },
  { href: "/library", label: "Library", icon: Library },
  { href: "/stats", label: "Stats", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

export function useCreatePlaylist() {
  const router = useRouter();
  return async () => {
    try {
      const p = await createPlaylist({});
      router.push(`/playlist/${p.id}`);
    } catch {
      /* toast already shown */
    }
  };
}

export function Sidebar() {
  const pathname = usePathname();
  const playlists = usePlaylists();
  const create = useCreatePlaylist();
  return (
    <nav aria-label="Main" className="hidden w-64 shrink-0 flex-col gap-2 bg-bg p-2 md:flex">
      <div className="rounded-xl bg-surface p-3">
        <Link href="/" className="mb-3 flex items-center gap-2 px-2 text-lg font-bold">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/spotube-logo.png" alt="" className="size-7" />
          Spotube <span className="text-accent">Web</span>
        </Link>
        <ul className="flex flex-col">
          {NAV.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                className={clsx(
                  "flex items-center gap-4 rounded-lg px-3 py-2 font-medium transition-colors",
                  isActive(pathname, href) ? "bg-surface-2 text-fg" : "text-muted hover:text-fg",
                )}
              >
                <Icon className="size-5" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex min-h-0 flex-1 flex-col rounded-xl bg-surface p-2">
        <div className="flex items-center justify-between px-2 py-1">
          <span className="flex items-center gap-2 text-sm font-semibold text-muted">
            <ListMusic className="size-4" /> Your playlists
          </span>
          <button
            type="button"
            onClick={create}
            aria-label="Create playlist"
            title="Create playlist"
            className="rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
          >
            <Plus className="size-4" />
          </button>
        </div>
        <ul className="scrollbar-thin mt-1 flex-1 overflow-y-auto">
          <li>
            <Link
              href="/liked"
              className={clsx("flex items-center gap-3 rounded-lg p-2 hover:bg-surface-2", pathname === "/liked" && "bg-surface-2")}
            >
              <Artwork kind="liked" alt="" className="size-10" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">Liked Songs</span>
                <span className="flex items-center gap-1 text-xs text-muted">
                  <Heart className="size-3" /> Saved in this browser
                </span>
              </span>
            </Link>
          </li>
          {playlists === undefined ? null : playlists.length === 0 ? (
            <li className="px-2 py-3 text-sm text-muted">
              No playlists yet.{" "}
              <button type="button" className="text-fg underline" onClick={() => create().then(() => toast.success("Playlist created"))}>
                Create one
              </button>
            </li>
          ) : (
            playlists.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/playlist/${p.id}`}
                  className={clsx(
                    "flex items-center gap-3 rounded-lg p-2 hover:bg-surface-2",
                    pathname === `/playlist/${p.id}` && "bg-surface-2",
                  )}
                >
                  <Artwork src={p.artwork} kind="playlist" alt="" className="size-10" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block text-xs text-muted">
                      Playlist · {p.trackKeys.length} track{p.trackKeys.length === 1 ? "" : "s"}
                    </span>
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>
    </nav>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(pathname, href) ? "page" : undefined}
          className={clsx(
            "flex flex-col items-center gap-0.5 py-2 text-[11px]",
            isActive(pathname, href) ? "text-fg" : "text-muted",
          )}
        >
          <Icon className="size-5" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
