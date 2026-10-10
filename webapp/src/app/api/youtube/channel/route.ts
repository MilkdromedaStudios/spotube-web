import { handler, json, requireParam, sameOrigin } from "@/lib/server/http";
import { channel } from "@/lib/server/youtube";

export const GET = handler(async (req: Request) => {
  sameOrigin(req);
  const id = requireParam(new URL(req.url), "id", /^UC[A-Za-z0-9_-]{22}$/);
  return json(await channel(id), { maxAge: 3600 });
});
