import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export type EnvName =
  | "YOUTUBE_API_KEY"
  | "YOUTUBE_REGION_CODE"
  | "SPOTIFY_CLIENT_ID"
  | "SPOTIFY_CLIENT_SECRET"
  | "SPOTIFY_REDIRECT_URI"
  | "SOUNDCLOUD_CLIENT_ID"
  | "SOUNDCLOUD_CLIENT_SECRET"
  | "APPLE_MUSIC_TEAM_ID"
  | "APPLE_MUSIC_KEY_ID"
  | "APPLE_MUSIC_PRIVATE_KEY"
  | "SESSION_SECRET"
  | "ALLOWED_ORIGINS";

/**
 * Reads configuration from `process.env` (Node / next dev) or the Cloudflare
 * Worker bindings (vars and secrets) when running on Workers.
 */
export function env(name: EnvName): string | undefined {
  const fromProcess = typeof process !== "undefined" ? process.env?.[name] : undefined;
  if (fromProcess) return fromProcess;
  try {
    const value = (getCloudflareContext().env as Record<string, unknown>)[name];
    return typeof value === "string" && value ? value : undefined;
  } catch {
    return undefined;
  }
}

export const providersConfigured = () => ({
  youtube: !!env("YOUTUBE_API_KEY"),
  spotify: !!(env("SPOTIFY_CLIENT_ID") && env("SPOTIFY_CLIENT_SECRET")),
  spotifyLogin: !!(env("SPOTIFY_CLIENT_ID") && env("SPOTIFY_CLIENT_SECRET") && env("SESSION_SECRET")),
  soundcloud: !!(env("SOUNDCLOUD_CLIENT_ID") && env("SOUNDCLOUD_CLIENT_SECRET")),
  apple: !!(env("APPLE_MUSIC_TEAM_ID") && env("APPLE_MUSIC_KEY_ID") && env("APPLE_MUSIC_PRIVATE_KEY")),
});
