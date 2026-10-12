"use client";

import { refreshSpotifyPlayer } from "@/lib/player/engine";

/**
 * Spotify's own sign-in page, which returns to Spotify's web player afterwards. Signing in there
 * lets Spotify's player on this site play full songs (Free accounts included) instead of previews.
 * This site never sees the listener's Spotify password or sign-in.
 */
export const SPOTIFY_SIGN_IN_URL = `https://accounts.spotify.com/login?continue=${encodeURIComponent("https://open.spotify.com/")}`;

let waiting = false;

/**
 * Call when the listener opens Spotify's sign-in page in a new tab. When they come back to this
 * tab, Spotify's player reloads so it picks up the sign-in.
 */
export function onSpotifySignInOpened() {
  if (waiting) return;
  waiting = true;
  const back = () => {
    if (document.visibilityState !== "visible") return;
    waiting = false;
    window.removeEventListener("focus", back);
    document.removeEventListener("visibilitychange", back);
    refreshSpotifyPlayer();
  };
  // Opening the tab moves focus away first; start listening after that so it doesn't count.
  setTimeout(() => {
    window.addEventListener("focus", back);
    document.addEventListener("visibilitychange", back);
  }, 500);
}
