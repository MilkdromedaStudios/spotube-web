import { defineConfig, devices } from "@playwright/test";

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || (process.env.CI ? undefined : "/opt/pw-browsers/chromium");
const launchOptions = executablePath ? { executablePath } : {};
// Runs against the static build (`npm run build`) served by Cloudflare's local Pages runtime.
// Set BASE_URL to test another server instead.
const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    launchOptions,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
    command: "npx wrangler pages dev out --port 3100 --ip 127.0.0.1 --compatibility-date 2026-09-01",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
