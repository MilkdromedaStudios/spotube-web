import { afterEach, describe, expect, it } from "vitest";
import { developerToken } from "./apple";
import { seal, unseal } from "./seal";

const b64urlDecode = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

afterEach(() => {
  delete process.env.SESSION_SECRET;
  delete process.env.APPLE_MUSIC_TEAM_ID;
  delete process.env.APPLE_MUSIC_KEY_ID;
  delete process.env.APPLE_MUSIC_PRIVATE_KEY;
});

describe("session sealing", () => {
  it("encrypts and decrypts, and rejects tampering", async () => {
    process.env.SESSION_SECRET = "x".repeat(40);
    const sealed = await seal("refresh-token-123");
    expect(sealed).not.toContain("refresh");
    expect(await unseal(sealed)).toBe("refresh-token-123");
    expect(await unseal(sealed.slice(0, -2) + "AA")).toBeNull();
  });

  it("requires a strong SESSION_SECRET", async () => {
    process.env.SESSION_SECRET = "short";
    await expect(seal("x")).rejects.toThrow(/SESSION_SECRET/);
  });
});

describe("Apple MusicKit developer token", () => {
  it("signs a verifiable ES256 JWT with WebCrypto", async () => {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
    const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8))}\n-----END PRIVATE KEY-----`;
    process.env.APPLE_MUSIC_TEAM_ID = "TEAM123456";
    process.env.APPLE_MUSIC_KEY_ID = "KEY1234567";
    process.env.APPLE_MUSIC_PRIVATE_KEY = pem.replace(/\n/g, "\\n"); // as stored in a single-line env var
    const { token } = await developerToken();
    const [h, p, s] = token.split(".");
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(h)))).toEqual({ alg: "ES256", kid: "KEY1234567", typ: "JWT" });
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(p)));
    expect(payload.iss).toBe("TEAM123456");
    expect(payload.exp).toBeGreaterThan(payload.iat);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pair.publicKey, b64urlDecode(s), new TextEncoder().encode(`${h}.${p}`));
    expect(ok).toBe(true);
  });
});
