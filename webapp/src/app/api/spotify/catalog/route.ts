import { handler, json, requireParam, sameOrigin } from "@/lib/server/http";
import { catalog } from "@/lib/server/spotify";

/** Read-only Spotify catalog proxy for visitors who haven't connected an account. */
export const GET = handler(async (req: Request) => {
  sameOrigin(req);
  const url = new URL(req.url);
  const path = requireParam(url, "path");
  url.searchParams.delete("path");
  return json(await catalog(path, url.searchParams), { maxAge: 3600 });
});
