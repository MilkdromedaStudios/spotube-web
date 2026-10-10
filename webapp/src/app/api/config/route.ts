import { providersConfigured } from "@/lib/server/env";
import { json } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** Tells the browser which providers this deployment has credentials for. Never returns secrets. */
export async function GET() {
  return json({ providers: providersConfigured() });
}
