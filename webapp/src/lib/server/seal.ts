import "server-only";
import { env } from "./env";
import { ApiError } from "./http";

/**
 * Encrypts small secrets (OAuth refresh tokens) into an opaque string with
 * AES-GCM, keyed from SESSION_SECRET. Used for the HttpOnly session cookie so
 * provider credentials never reach page JavaScript or IndexedDB.
 */
async function key() {
  const secret = env("SESSION_SECRET");
  if (!secret || secret.length < 32)
    throw new ApiError(503, "not_configured", "SESSION_SECRET must be set (32+ characters) to connect accounts.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export async function seal(value: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), new TextEncoder().encode(value)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return b64url(out);
}

export async function unseal(sealed: string): Promise<string | null> {
  try {
    const bytes = fromB64url(sealed);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, await key(), bytes.slice(12));
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

export function randomToken(bytes = 24) {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}
