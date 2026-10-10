import { handler, json, requireParam, sameOrigin } from "@/lib/server/http";
import { playlist } from "@/lib/server/youtube";

export const GET = handler(async (req: Request) => {
  sameOrigin(req);
  const url = new URL(req.url);
  const id = requireParam(url, "id", /^[A-Za-z0-9_-]{10,64}$/);
  return json(await playlist(id, url.searchParams.get("pageToken") ?? undefined), { maxAge: 1800 });
});
