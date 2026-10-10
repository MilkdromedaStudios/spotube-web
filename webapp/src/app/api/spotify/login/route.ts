import { NextResponse } from "next/server";
import { errorJson } from "@/lib/server/http";
import { randomToken, seal } from "@/lib/server/seal";
import { STATE_COOKIE, authorizeUrl } from "@/lib/server/spotify";

export const dynamic = "force-dynamic";

/** Starts the Spotify authorization-code flow. */
export async function GET(req: Request) {
  try {
    const origin = new URL(req.url).origin;
    const state = randomToken();
    await seal("probe"); // fail early with a clear message if SESSION_SECRET is missing
    const res = NextResponse.redirect(authorizeUrl(origin, state));
    res.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure: origin.startsWith("https:"),
      sameSite: "lax",
      path: "/api/spotify",
      maxAge: 600,
    });
    return res;
  } catch (e) {
    return errorJson(e);
  }
}
