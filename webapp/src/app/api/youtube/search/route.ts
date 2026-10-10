import { handler, json, requireParam, sameOrigin } from "@/lib/server/http";
import { parseTypes } from "@/lib/server/params";
import { search } from "@/lib/server/youtube";

export const GET = handler(async (req: Request) => {
  sameOrigin(req);
  const url = new URL(req.url);
  const q = requireParam(url, "q");
  return json(await search(q, parseTypes(url), url.searchParams.get("pageToken") ?? undefined), { maxAge: 3600 });
});
