// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getCookie } from "./cookies";
import { handleApi } from "./routes";
import { seal } from "./seal";

const ORIGIN = "https://music.example.com";
const SECRETS = {
  SPOTIFY_CLIENT_ID: "client-id",
  SPOTIFY_CLIENT_SECRET: "client-secret",
  SESSION_SECRET: "s".repeat(40),
};

const call = (path: string, init: RequestInit = {}, env: Record<string, unknown> = {}) =>
  handleApi(new Request(`${ORIGIN}${path}`, init), env);

describe("Pages Function API", () => {
  it("reports configured providers as booleans only", async () => {
    const res = await call("/api/config", {}, { ...SECRETS, YOUTUBE_API_KEY: "yt-key" });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    const body = await res.text();
    expect(JSON.parse(body).providers).toMatchObject({ youtube: true, spotify: true, spotifyLogin: true, soundcloud: false, apple: false });
    expect(body).not.toContain("yt-key");
    expect(body).not.toContain("client-secret");
  });

  it("returns 404 for unknown endpoints and 405 for the wrong method", async () => {
    expect((await call("/api/nope")).status).toBe(404);
    expect((await call("/api/config", { method: "POST" })).status).toBe(405);
    expect((await call("/api/spotify/token")).status).toBe(405);
  });

  it("explains missing keys instead of failing", async () => {
    const res = await call("/api/youtube/search?q=test");
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("not_configured");
  });

  it("rejects cross-site browser requests", async () => {
    const res = await call("/api/youtube/search?q=test", { headers: { "Sec-Fetch-Site": "cross-site" } }, { YOUTUBE_API_KEY: "k" });
    expect(res.status).toBe(403);
  });

  it("starts Spotify sign-in with an HttpOnly state cookie scoped to /api/spotify", async () => {
    const res = await call("/api/spotify/login", {}, SECRETS);
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("Location")!);
    expect(location.origin).toBe("https://accounts.spotify.com");
    expect(location.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/spotify/callback`);
    const cookie = res.headers.get("Set-Cookie")!;
    expect(cookie).toMatch(/^sp_oauth_state=/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/api/spotify");
    expect(cookie.match(/sp_oauth_state=([^;]+)/)![1]).toBe(location.searchParams.get("state"));
  });

  it("rejects an OAuth callback whose state doesn't match the cookie", async () => {
    const res = await call("/api/spotify/callback?code=abc&state=wrong", { headers: { Cookie: "sp_oauth_state=right" } }, SECRETS);
    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toBe(`${ORIGIN}/settings?spotify=invalid_state#providers`);
    expect(res.headers.get("Set-Cookie")).toContain("sp_oauth_state=; Path=/api/spotify; Max-Age=0");
  });

  it("reports signed out without a session, and clears an unreadable session cookie", async () => {
    const none = await call("/api/spotify/token", { method: "POST" }, SECRETS);
    expect(await none.json()).toEqual({ connected: false });
    expect(none.headers.get("Cache-Control")).toBe("no-store");

    const bad = await call("/api/spotify/token", { method: "POST", headers: { Cookie: "sp_session=garbage" } }, SECRETS);
    expect(await bad.json()).toEqual({ connected: false });
    expect(bad.headers.get("Set-Cookie")).toContain("sp_session=; Path=/api/spotify; Max-Age=0");
  });

  it("logs out by clearing the session cookie", async () => {
    const res = await call("/api/spotify/logout", { method: "POST" }, SECRETS);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("Set-Cookie")).toContain("sp_session=;");
  });
});

describe("cookies", () => {
  it("reads one cookie among several and survives sealed values", async () => {
    process.env.SESSION_SECRET = "s".repeat(40);
    const sealed = await seal("token");
    delete process.env.SESSION_SECRET;
    const req = new Request(ORIGIN, { headers: { Cookie: `a=1; sp_session=${encodeURIComponent(sealed)}; b=2` } });
    expect(getCookie(req, "sp_session")).toBe(sealed);
    expect(getCookie(req, "missing")).toBeUndefined();
  });
});
