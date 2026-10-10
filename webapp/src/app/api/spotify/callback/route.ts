import { NextResponse, type NextRequest } from "next/server";
import { seal } from "@/lib/server/seal";
import { SESSION_COOKIE, STATE_COOKIE, exchangeCode } from "@/lib/server/spotify";

export const dynamic = "force-dynamic";

/**
 * OAuth callback. The refresh token is encrypted into an HttpOnly cookie that
 * page scripts can't read; it is never written to IndexedDB.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const back = (status: string) => {
    const res = NextResponse.redirect(new URL(`/settings?spotify=${status}#providers`, url.origin));
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/spotify" });
    return res;
  };
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error")) return back("denied");
  if (!code || !state || state !== req.cookies.get(STATE_COOKIE)?.value) return back("invalid_state");
  try {
    const tokens = await exchangeCode(code, url.origin);
    if (!tokens.refresh_token) return back("error");
    const res = back("connected");
    res.cookies.set(SESSION_COOKIE, await seal(tokens.refresh_token), {
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "lax",
      path: "/api/spotify",
      maxAge: 60 * 60 * 24 * 60,
    });
    return res;
  } catch (e) {
    console.error(e);
    return back("error");
  }
}
