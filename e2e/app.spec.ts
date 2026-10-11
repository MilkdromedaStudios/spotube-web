import { expect, test, chromium } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mockYouTube, playlistFile, ready, track } from "./helpers";

test("home and search load and explain missing provider keys", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Good|Welcome/);
  await expect(page.getByText("No music provider has search enabled")).toBeVisible();

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/search/);
  await page.getByLabel("Search music").fill("daft punk");
  await expect(page.getByText(/YOUTUBE_API_KEY/)).toBeVisible();
});

test("server config endpoint reports providers without leaking secrets", async ({ request }) => {
  const res = await request.get("/api/config");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.providers).toMatchObject({ youtube: false, spotify: false, soundcloud: false, apple: false });
  const yt = await request.get("/api/youtube/search?q=test");
  expect(yt.status()).toBe(503);
  expect((await yt.json()).error.code).toBe("not_configured");
});

test("security headers block third-party scripts", async ({ request }) => {
  const res = await request.get("/");
  const csp = res.headers()["content-security-policy"];
  expect(csp).toContain("script-src 'self'");
  expect(csp).toContain("https://www.youtube.com");
  expect(csp).not.toContain("googletagmanager");
  expect(res.headers()["permissions-policy"]).toContain("browsing-topics=()");
});

test("unknown pages and API endpoints return 404", async ({ page, request }) => {
  expect((await page.goto("/no-such-page"))?.status()).toBe(404);
  await expect(page.getByText(/not found/i).first()).toBeVisible();
  expect((await request.get("/api/no-such-endpoint")).status()).toBe(404);
  expect((await request.post("/api/config")).status()).toBe(405);
});

test("deep links render directly", async ({ page }) => {
  for (const url of ["/library?tab=albums", "/settings", "/stats", "/liked", "/playlist?id=does-not-exist", "/album?provider=spotify&id=abc"]) {
    const res = await page.goto(url);
    expect(res?.status(), url).toBe(200);
  }
  await expect(page.getByText(/Spotify needs SPOTIFY_CLIENT_ID|SPOTIFY_CLIENT_ID/)).toBeVisible();
});

test("playlists are saved to IndexedDB and survive a refresh", async ({ page }) => {
  await page.goto("/library");
  await ready(page);
  await page.getByRole("button", { name: "New playlist" }).click();
  await expect(page).toHaveURL(/\/playlist\?id=/);
  await page.getByTitle("Edit details").click();
  await page.getByLabel("Name").fill("Night Drive");
  await page.getByLabel("Description").fill("Synths only");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Night Drive" })).toBeVisible();

  await page.reload();
  await ready(page);
  await expect(page.getByRole("heading", { name: "Night Drive" })).toBeVisible();
  await expect(page.getByText("Synths only")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" }).getByText("Night Drive")).toBeVisible();

  const stored = await page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const req = indexedDB.open("spotube-web");
        req.onsuccess = () => {
          const tx = req.result.transaction("playlists");
          const all = tx.objectStore("playlists").getAll();
          all.onsuccess = () => resolve(all.result.map((p: { name: string }) => p.name));
        };
      }),
  );
  expect(stored).toContain("Night Drive");
  // Nothing is kept in localStorage or cookies.
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(await page.context().cookies()).toHaveLength(0);
});

test("import, play, queue controls, reorder, export and delete", async ({ page }) => {
  await mockYouTube(page);
  await page.goto("/library");
  await ready(page);
  await page.locator("input[type=file]").setInputFiles(
    playlistFile("Test Mix", [track("aaaaaaaaaa1", "First Song"), track("aaaaaaaaaa2", "Second Song"), track("aaaaaaaaaa3", "Third Song")]),
  );
  await expect(page.getByText("Imported playlist with 3 tracks")).toBeVisible();
  await page.getByRole("link", { name: /Test Mix/ }).first().click();
  await expect(page.getByRole("heading", { name: "Test Mix" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Play First Song/ })).toBeVisible();

  // Play
  await page.getByRole("button", { name: "Play Test Mix" }).click();
  const bar = page.getByRole("contentinfo", { name: "Player" });
  await expect(bar.getByText("First Song").filter({ visible: true })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Pause" }).filter({ visible: true })).toBeVisible();
  await expect(page.getByTestId("fake-youtube")).toHaveText("YouTube player: aaaaaaaaaa1");
  // The official player is visible (not hidden) while playing.
  await expect(page.getByTestId("fake-youtube")).toBeVisible();

  // Pause / resume via keyboard
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Space");
  await expect(bar.getByRole("button", { name: "Play", exact: true }).filter({ visible: true })).toBeVisible();
  await bar.getByRole("button", { name: "Play", exact: true }).filter({ visible: true }).click();
  await expect(bar.getByRole("button", { name: "Pause" }).filter({ visible: true })).toBeVisible();

  // Next / previous
  await bar.getByRole("button", { name: /^Next/ }).filter({ visible: true }).click();
  await expect(bar.getByText("Second Song").filter({ visible: true })).toBeVisible();
  await expect(page.getByTestId("fake-youtube")).toHaveText("YouTube player: aaaaaaaaaa2");
  await bar.getByRole("button", { name: /^Previous/ }).filter({ visible: true }).click();
  await expect(bar.getByText("First Song").filter({ visible: true })).toBeVisible();

  // Seek bar reflects progress and position advances
  await expect(bar.getByLabel("Seek")).toBeEnabled();
  await page.waitForTimeout(1200);
  const pos = Number(await bar.getByLabel("Seek").inputValue());
  expect(pos).toBeGreaterThan(0);

  // Queue panel
  await bar.getByRole("button", { name: "Queue (Q)" }).filter({ visible: true }).click();
  const queue = page.getByRole("complementary", { name: "Queue" });
  await expect(queue.getByText("3 tracks")).toBeVisible();
  await queue.getByRole("button", { name: "Close queue" }).click();

  // Like from the player, then check Liked Songs
  await bar.getByRole("button", { name: /Save First Song to Liked Songs/ }).filter({ visible: true }).click();
  await page.getByRole("link", { name: /Liked Songs/ }).first().click();
  await expect(page.locator("#main").getByRole("button", { name: /Play First Song/ })).toBeVisible();

  // Navigating between pages did not restart playback
  await expect(page.getByTestId("fake-youtube")).toHaveText("YouTube player: aaaaaaaaaa1");

  // Export the playlist
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /Test Mix/ }).click();
  await page.getByRole("button", { name: "Playlist options" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Export as JSON" }).click()]);
  const exported = JSON.parse(fs.readFileSync((await download.path())!, "utf8"));
  expect(exported.format).toBe("spotube-web-playlist");
  expect(exported.tracks.map((t: { title: string }) => t.title)).toEqual(["First Song", "Second Song", "Third Song"]);

  // Reorder with the keyboard (accessible drag-and-drop), then check it persisted
  const handle = page.locator("#main").getByRole("button", { name: "Reorder Third Song" });
  await handle.focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(200);
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(200);
  await page.keyboard.press("Space");
  await expect(page.locator("#main ol li").first()).toContainText("Third Song");
  await page.reload();
  await ready(page);
  await expect(page.locator("#main ol li").first()).toContainText("Third Song");

  // Delete
  await page.getByRole("button", { name: "Playlist options" }).click();
  await page.getByRole("menuitem", { name: "Delete playlist" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/\/library/);
});

test("unplayable tracks show an error and skip to the next one", async ({ page }) => {
  await mockYouTube(page);
  await page.goto("/library");
  await ready(page);
  await page.locator("input[type=file]").setInputFiles(playlistFile("Broken", [track("unplayable0", "Blocked Song"), track("bbbbbbbbbb2", "Good Song")]));
  await page.getByRole("link", { name: /Broken/ }).first().click();
  await page.getByRole("button", { name: "Play Broken" }).click();
  await expect(page.getByText(/doesn't allow this video to be played outside YouTube/).first()).toBeVisible();
  const bar = page.getByRole("contentinfo", { name: "Player" });
  await expect(bar.getByText("Good Song").filter({ visible: true })).toBeVisible({ timeout: 10_000 });
  await expect(bar.getByRole("button", { name: "Pause" }).filter({ visible: true })).toBeVisible();
});

test("playback settings, queue and theme persist across reloads", async ({ page }) => {
  await mockYouTube(page);
  await page.goto("/library");
  await ready(page);
  await page.locator("input[type=file]").setInputFiles(playlistFile("Persist", [track("ccccccccccc", "Keep Me"), track("ddddddddddd", "And Me")]));
  await page.getByRole("link", { name: /Persist/ }).first().click();
  await page.getByRole("button", { name: "Play Persist" }).click();
  const bar = page.getByRole("contentinfo", { name: "Player" });
  await expect(bar.getByRole("button", { name: "Pause" }).filter({ visible: true })).toBeVisible();
  await bar.getByRole("button", { name: /Enable shuffle/ }).filter({ visible: true }).click();
  await bar.getByRole("button", { name: /Repeat all/ }).filter({ visible: true }).click();
  await bar.getByLabel("Volume").fill("35");
  await page.getByRole("link", { name: "Settings" }).first().click();
  await page.getByLabel("Theme").selectOption("light");
  await page.waitForTimeout(800);

  await page.reload();
  await ready(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(bar.getByText("Keep Me").filter({ visible: true })).toBeVisible();
  await expect(bar.getByRole("button", { name: /Disable shuffle/ }).filter({ visible: true })).toBeVisible();
  await expect(bar.getByRole("button", { name: /Repeat one/ }).filter({ visible: true })).toBeVisible();
  await expect(bar.getByLabel("Volume")).toHaveValue("35");
  // Restored sessions don't autoplay; pressing play resumes the same track.
  await bar.getByRole("button", { name: "Play", exact: true }).filter({ visible: true }).click();
  await expect(page.getByTestId("fake-youtube")).toHaveText("YouTube player: ccccccccccc");
});

test("full backup export, clear data and import restores the library", async ({ page }) => {
  await page.goto("/library");
  await ready(page);
  await page.locator("input[type=file]").setInputFiles(playlistFile("Backup Me", [track("eeeeeeeeeee", "Saved Song")]));
  await expect(page.getByText("Imported playlist")).toBeVisible();
  await page.goto("/settings#storage");
  await ready(page);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).click()]);
  const file = (await download.path())!;
  const backup = JSON.parse(fs.readFileSync(file, "utf8"));
  expect(backup.format).toBe("spotube-web-backup");
  expect(backup.data.playlists.map((p: { name: string }) => p.name)).toContain("Backup Me");

  await page.getByRole("button", { name: "Clear data" }).click();
  await page.getByRole("button", { name: "Delete everything" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("navigation", { name: "Main" }).getByText("Backup Me")).toHaveCount(0);

  await page.goto("/settings#storage");
  await ready(page);
  await page.locator("input[type=file]").setInputFiles(file);
  await expect(page.getByText(/Imported 1 playlists/)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" }).getByText("Backup Me")).toBeVisible();
});

test("favorites survive a full browser restart", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spotube-profile-"));
  const opts = { executablePath: process.env.CI ? undefined : "/opt/pw-browsers/chromium", baseURL: process.env.BASE_URL ?? "http://127.0.0.1:3100" };
  let ctx = await chromium.launchPersistentContext(dir, opts);
  let page = await ctx.newPage();
  await page.goto("/library");
  await ready(page);
  await page.locator("input[type=file]").setInputFiles(playlistFile("Restart", [track("fffffffffff", "Favorite Song")]));
  await page.getByRole("link", { name: /Restart/ }).first().click();
  await page.getByRole("button", { name: /Save Favorite Song to Liked Songs/ }).first().click({ force: true });
  await expect(page.getByText("Added to Liked Songs")).toBeVisible();
  await ctx.close();

  ctx = await chromium.launchPersistentContext(dir, opts);
  page = await ctx.newPage();
  await page.goto("/liked");
  await ready(page);
  await expect(page.getByRole("button", { name: /Play Favorite Song/ })).toBeVisible();
  await ctx.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
