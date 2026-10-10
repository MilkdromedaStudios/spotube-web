import { parseMusicLink } from "@/lib/providers/links";
import { ApiError, handler, json, requireParam, sameOrigin } from "@/lib/server/http";
import { resolveLink } from "@/lib/server/oembed";

export const GET = handler(async (req: Request) => {
  sameOrigin(req);
  const link = parseMusicLink(requireParam(new URL(req.url), "url"));
  if (!link) throw new ApiError(400, "bad_request", "That isn't a YouTube, Spotify, SoundCloud or Apple Music link.");
  return json(await resolveLink(link), { maxAge: 3600 });
});
