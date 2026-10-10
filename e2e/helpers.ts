import type { Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

export const fakeYouTube = fs.readFileSync(path.join(__dirname, "fake-youtube.js"), "utf8");

/** Serve the YouTube IFrame API test double instead of the real one (no network in CI). */
export async function mockYouTube(page: Page) {
  await page.route("https://www.youtube.com/iframe_api", (r) => r.fulfill({ contentType: "text/javascript", body: fakeYouTube }));
}

export const track = (id: string, title: string, artist = "Test Artist") => ({
  key: `youtube:${id}`,
  provider: "youtube",
  id,
  title,
  artists: [{ name: artist }],
  durationMs: 30_000,
  url: `https://www.youtube.com/watch?v=${id}`,
  playbackRef: id,
});

export function playlistFile(name: string, tracks: ReturnType<typeof track>[]) {
  return {
    name: `${name}.json`,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "spotube-web-playlist", version: 1, playlist: { name, description: "From a test" }, tracks })),
  };
}

/** Waits until the app has opened IndexedDB and restored state. */
export async function ready(page: Page) {
  await page.waitForFunction(() => document.querySelector("nav[aria-label='Main']") !== null);
  await page.waitForTimeout(300);
}
