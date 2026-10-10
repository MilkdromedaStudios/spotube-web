import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { errorJson, sameOrigin } from "@/lib/server/http";
import { seal, unseal } from "@/lib/server/seal";
import { SESSION_COOKIE, refresh } from "@/lib/server/spotify";

export const dynamic = "force-dynamic";

/**
 * Exchanges the HttpOnly session cookie for a short-lived access token that
 * the page keeps in memory only.
 */
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    const sealed = req.cookies.get(SESSION_COOKIE)?.value;
    if (!sealed) return NextResponse.json({ connected: false }, { headers: { "Cache-Control": "no-store" } });
    const refreshToken = await unseal(sealed);
    if (!refreshToken) {
      const res = NextResponse.json({ connected: false }, { headers: { "Cache-Control": "no-store" } });
      res.cookies.delete({ name: SESSION_COOKIE, path: "/api/spotify" });
      return res;
    }
    const tokens = await refresh(refreshToken);
    const res = NextResponse.json(
      { connected: true, accessToken: tokens.access_token, expiresIn: tokens.expires_in, scope: tokens.scope ?? "" },
      { headers: { "Cache-Control": "no-store" } },
    );
    if (tokens.refresh_token && tokens.refresh_token !== refreshToken) {
      res.cookies.set(SESSION_COOKIE, await seal(tokens.refresh_token), {
        httpOnly: true,
        secure: new URL(req.url).protocol === "https:",
        sameSite: "lax",
        path: "/api/spotify",
        maxAge: 60 * 60 * 24 * 60,
      });
    }
    return res;
  } catch (e) {
    const res = errorJson(e);
    if (res.status === 401) {
      const out = NextResponse.json({ connected: false, error: "Spotify session expired." }, { headers: { "Cache-Control": "no-store" } });
      out.cookies.delete({ name: SESSION_COOKIE, path: "/api/spotify" });
      return out;
    }
    return res;
  }
}
