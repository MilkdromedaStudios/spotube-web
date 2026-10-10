import { handler, json, requireParam, sameOrigin } from "@/lib/server/http";
import { parseTypes } from "@/lib/server/params";
import { search } from "@/lib/server/soundcloud";

export const GET = handler(async (req: Request) => {
  sameOrigin(req);
  const url = new URL(req.url);
  const offset = Math.max(0, Math.min(1000, Number(url.searchParams.get("offset")) || 0));
  return json(await search(requireParam(url, "q"), parseTypes(url), offset), { maxAge: 1800 });
});
