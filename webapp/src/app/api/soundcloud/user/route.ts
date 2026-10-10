import { handler, json, requireParam, sameOrigin } from "@/lib/server/http";
import { user } from "@/lib/server/soundcloud";

export const GET = handler(async (req: Request) => {
  sameOrigin(req);
  return json(await user(requireParam(new URL(req.url), "id", /^\d+$/)), { maxAge: 1800 });
});
