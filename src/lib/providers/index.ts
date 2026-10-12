"use client";

import { apiGet, CONFIG_HINT, ProviderError, useServerConfig } from "./api";
import { apple, appleSong } from "./apple";
import { parseMusicLink, type LinkKind } from "./links";
import { soundcloud } from "./soundcloud";
import { spotify } from "./spotify";
import type { ProviderClient } from "./types";
import { youtube } from "./youtube";
import { useSettings } from "@/lib/settings";
import { PROVIDER_IDS, PROVIDER_LABELS, type ProviderId, type Track } from "@/lib/types";

export const providers: Record<ProviderId, ProviderClient> = { youtube, spotify, soundcloud, apple };

export interface ProviderStatus {
  id: ProviderId;
  label: string;
  enabled: boolean;
  configured: boolean;
  /** Search/browse can be used right now */
  ready: boolean;
  reason?: string;
}

export function useProviderStatuses(): ProviderStatus[] {
  const settings = useSettings();
  const config = useServerConfig();
  return PROVIDER_IDS.map((id) => {
    const enabled = settings.enabledProviders[id];
    const configured = config.providers[id];
    let reason: string | undefined;
    if (!enabled) reason = `${PROVIDER_LABELS[id]} is turned off in Settings → Music providers.`;
    else if (!config.loaded) reason = "Loading…";
    else if (config.error) reason = "Couldn't connect to the site. Check your connection and reload the page.";
    else if (!configured) reason = CONFIG_HINT[id];
    return { id, label: PROVIDER_LABELS[id], enabled, configured, ready: enabled && configured, reason };
  });
}

export type ResolvedLink =
  | { kind: "track"; track: Track }
  | { kind: Exclude<LinkKind, "track">; provider: ProviderId; id: string };

/** Resolves a pasted share link into a playable track, or a page to open. */
export async function resolveLink(input: string): Promise<ResolvedLink> {
  const link = parseMusicLink(input);
  if (!link) throw new ProviderError("That isn't a YouTube, Spotify, SoundCloud or Apple Music link.", "bad_request");
  if (link.provider === "apple") {
    if (link.kind === "track") {
      const track = await appleSong(link.id);
      if (!track) throw new ProviderError("Apple Music couldn't find that song.", "not_found");
      return { kind: "track", track };
    }
    return { kind: link.kind, provider: "apple", id: link.id };
  }
  return apiGet<ResolvedLink>("/api/resolve", { url: link.url });
}

export { pathFor } from "@/lib/paths";
