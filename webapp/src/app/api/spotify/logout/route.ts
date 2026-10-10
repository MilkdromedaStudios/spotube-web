import { NextResponse } from "next/server";
import { sameOrigin, errorJson } from "@/lib/server/http";
import { SESSION_COOKIE } from "@/lib/server/spotify";

export async function POST(req: Request) {
  try {
    sameOrigin(req);
  } catch (e) {
    return errorJson(e);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete({ name: SESSION_COOKIE, path: "/api/spotify" });
  return res;
}
