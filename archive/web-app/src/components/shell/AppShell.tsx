"use client";

import { DatabaseZap, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { GlobalDialogs } from "./GlobalDialogs";
import { MobileNav, Sidebar } from "./Sidebar";
import { MediaStage } from "@/components/player/MediaStage";
import { NowPlaying } from "@/components/player/NowPlaying";
import { PlayerBar } from "@/components/player/PlayerBar";
import { QueuePanel } from "@/components/player/QueuePanel";
import { MobileDock, StagePanel } from "@/components/player/StagePanels";
import { initDb, requestPersistentStorage, useDbStatus } from "@/lib/db/db";
import {
  cycleRepeat,
  initPlayer,
  next,
  previous,
  seekBy,
  setNowPlayingOpen,
  setQueueOpen,
  setVolume,
  toggleMute,
  togglePlay,
  toggleShuffle,
  usePlayer,
} from "@/lib/player/engine";
import { initMediaSession } from "@/lib/player/mediaSession";
import { useServerConfig } from "@/lib/providers/api";
import { getUserToken } from "@/lib/providers/spotify";
import { ACCENTS, getSettings, useSettings, useSettingsStore } from "@/lib/settings";
import { useUi } from "@/lib/uiStore";

const DARK_TEXT_ACCENTS = new Set(["green", "slate", "yellow", "teal", "orange"]);

function useTheme() {
  const { theme, accent, reduceMotion } = useSettings();
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.dataset.theme = dark ? "dark" : "light";
    };
    apply();
    root.style.setProperty("--accent", ACCENTS[accent].color);
    root.style.setProperty("--accent-fg", DARK_TEXT_ACCENTS.has(accent) ? "#0a0a0a" : "#ffffff");
    root.dataset.reduceMotion = String(reduceMotion);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme, accent, reduceMotion]);
}

function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return el.isContentEditable || tag === "TEXTAREA" || tag === "SELECT" || (tag === "INPUT" && (el as HTMLInputElement).type !== "range");
}

function useShortcuts() {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.altKey || e.defaultPrevented) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key;
      const run = (fn: () => void) => {
        e.preventDefault();
        fn();
      };
      if (ctrl && key === "ArrowRight") return run(() => next());
      if (ctrl && key === "ArrowLeft") return run(previous);
      if (ctrl) return;
      if ((e.target as HTMLElement)?.tagName === "INPUT" && key.startsWith("Arrow")) return; // let sliders work
      if (key === " " && (e.target as HTMLElement)?.tagName === "BUTTON") return; // space activates focused button
      switch (key) {
        case " ":
        case "k":
        case "K":
          return run(togglePlay);
        case "N":
          return e.shiftKey && run(() => next());
        case "P":
          return e.shiftKey && run(previous);
        case "j":
          return run(() => seekBy(-10_000));
        case "l":
          return run(() => seekBy(10_000));
        case "ArrowLeft":
          return run(() => seekBy(-5_000));
        case "ArrowRight":
          return run(() => seekBy(5_000));
        case "ArrowUp":
          return e.shiftKey && run(() => setVolume(usePlayer.getState().volume + 0.05));
        case "ArrowDown":
          return e.shiftKey && run(() => setVolume(usePlayer.getState().volume - 0.05));
        case "m":
          return run(toggleMute);
        case "s":
          return run(toggleShuffle);
        case "r":
          return run(cycleRepeat);
        case "q":
          return run(() => setQueueOpen(!usePlayer.getState().queueOpen));
        case "f":
          return run(() => setNowPlayingOpen(!usePlayer.getState().nowPlayingOpen));
        case "/":
          return run(() => {
            router.push("/search");
            setTimeout(() => document.getElementById("search-input")?.focus(), 50);
          });
        case "?":
          return run(() => useUi.setState({ shortcutsOpen: true }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
}

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

let booted = false;

async function boot() {
  if (booted) return;
  booted = true;
  await initDb();
  await useSettingsStore.getState().load();
  if (getSettings().requestPersistentStorage) void requestPersistentStorage().catch(() => {});
  void useServerConfig.getState().load();
  void getUserToken(); // restores a Spotify connection if the session cookie exists
  await initPlayer();
  initMediaSession();
}

export function AppShell({ children }: { children: ReactNode }) {
  useTheme();
  useShortcuts();
  const online = useOnline();
  const db = useDbStatus();
  useEffect(() => {
    void boot();
  }, []);

  return (
    <>
      <div className="flex h-dvh flex-col">
        {db.status === "unavailable" && (
          <div role="alert" className="flex items-center gap-2 bg-danger/15 px-4 py-2 text-sm">
            <DatabaseZap className="size-4 shrink-0 text-danger" />
            <span>
              <strong>Local storage unavailable.</strong> {db.error} Playback still works, but playlists and settings
              won&apos;t be saved.
            </span>
          </div>
        )}
        {!online && (
          <div role="status" className="flex items-center gap-2 bg-yellow-500/15 px-4 py-2 text-sm">
            <WifiOff className="size-4 shrink-0" />
            You&apos;re offline. Your library is still here; searching and streaming need a connection.
          </div>
        )}
        <div className="flex min-h-0 flex-1 md:gap-2 md:pr-2 md:pt-2">
          <Sidebar />
          <main id="main" className="scrollbar-thin min-w-0 flex-1 overflow-y-auto bg-surface md:rounded-xl">
            {children}
          </main>
          <StagePanel />
        </div>
        <MobileDock />
        <PlayerBar />
        <MobileNav />
      </div>
      <MediaStage />
      <NowPlaying />
      <QueuePanel />
      <GlobalDialogs />
    </>
  );
}
