import "server-only";
import { env } from "./env";
import { ApiError } from "./http";

let cachedToken: { value: string; expires: number } | null = null;

const b64url = (data: string | Uint8Array) => {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return bytes.buffer;
}

/**
 * Signs a MusicKit developer token (ES256 JWT) with the Apple Music private
 * key using WebCrypto, so it works on Cloudflare Workers without Node crypto.
 */
export async function developerToken(): Promise<{ token: string; expiresAt: number }> {
  if (cachedToken && cachedToken.expires > Date.now() + 3600_000)
    return { token: cachedToken.value, expiresAt: cachedToken.expires };
  const teamId = env("APPLE_MUSIC_TEAM_ID");
  const keyId = env("APPLE_MUSIC_KEY_ID");
  const pem = env("APPLE_MUSIC_PRIVATE_KEY");
  if (!teamId || !keyId || !pem)
    throw new ApiError(503, "not_configured", "Apple Music needs APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_KEY_ID and APPLE_MUSIC_PRIVATE_KEY.");

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey("pkcs8", pemToPkcs8(pem), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  } catch {
    throw new ApiError(503, "not_configured", "APPLE_MUSIC_PRIVATE_KEY is not a valid .p8 private key.");
  }
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 12 * 3600;
  const payload: Record<string, unknown> = { iss: teamId, iat, exp };
  const origins = env("ALLOWED_ORIGINS")?.split(",").map((s) => s.trim()).filter(Boolean);
  if (origins?.length) payload.origin = origins;
  const signingInput = `${b64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }))}.${b64url(JSON.stringify(payload))}`;
  // WebCrypto returns the raw r||s signature, which is exactly the JWS ES256 format.
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(signingInput)),
  );
  const token = `${signingInput}.${b64url(sig)}`;
  cachedToken = { value: token, expires: exp * 1000 };
  return { token, expiresAt: exp * 1000 };
}
