import { expect, test } from "@playwright/test";
import { mockYouTube, playlistFile, ready, track } from "./helpers";

test("mobile layout uses bottom navigation and has no horizontal overflow", async ({ page }) => {
  await mockYouTube(page);
  for (const url of ["/", "/search", "/library", "/settings", "/stats"]) {
    await page.goto(url);
    await ready(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, url).toBeLessThanOrEqual(0);
  }
  const navs = page.getByRole("navigation", { name: "Main" });
  await expect(navs.filter({ visible: true })).toHaveCount(1);

  await page.goto("/library");
  await ready(page);
  await page.locator("input[type=file]").setInputFiles(playlistFile("Phone Mix", [track("ggggggggggg", "Pocket Song")]));
  await page.getByRole("link", { name: /Phone Mix/ }).first().click();
  await page.getByRole("button", { name: "Play Phone Mix" }).click();
  const bar = page.getByRole("contentinfo", { name: "Player" });
  await expect(bar.getByText("Pocket Song").filter({ visible: true })).toBeVisible();
  await expect(page.getByTestId("fake-youtube")).toBeVisible();

  // Full-screen now playing view
  await bar.getByRole("button", { name: "Open now playing" }).filter({ visible: true }).click();
  const np = page.getByRole("dialog", { name: "Now playing" });
  await expect(np.getByRole("heading", { name: "Pocket Song" })).toBeVisible();
  await expect(page.getByTestId("fake-youtube")).toBeVisible();
  await np.getByRole("button", { name: /Close now playing/ }).click();
  await expect(np).toHaveCount(0);
});
