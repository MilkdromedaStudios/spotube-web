import { developerToken } from "@/lib/server/apple";
import { handler, json, sameOrigin } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * MusicKit developer token. It is designed to be used by browsers; it is
 * short-lived and can be restricted to this site's origin with ALLOWED_ORIGINS.
 */
export const GET = handler(async (req: Request) => {
  sameOrigin(req);
  return json(await developerToken());
});
