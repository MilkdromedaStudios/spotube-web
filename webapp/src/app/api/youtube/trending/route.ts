import { handler, json, sameOrigin } from "@/lib/server/http";
import { trending } from "@/lib/server/youtube";

export const GET = handler(async (req: Request) => {
  sameOrigin(req);
  const region = new URL(req.url).searchParams.get("region") ?? undefined;
  return json(await trending(region && /^[A-Za-z]{2}$/.test(region) ? region : undefined), { maxAge: 3 * 3600 });
});
