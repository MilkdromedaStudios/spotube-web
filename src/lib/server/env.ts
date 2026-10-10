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

let bound: Record<string, unknown> | undefined;

/**
 * Called by the Pages Function for every request with the project's
 * environment variables and secrets. They are the same for every request a
 * deployment serves, so keeping them in module scope is safe.
 */
export function bindEnv(values: Record<string, unknown> | undefined) {
  bound = values;
}

/** Reads a setting from the Cloudflare Pages environment, or `process.env` in tests. */
export function env(name: EnvName): string | undefined {
  const value = bound?.[name];
  if (typeof value === "string" && value) return value;
  const fromProcess = typeof process !== "undefined" ? process.env?.[name] : undefined;
  return fromProcess || undefined;
}

export const providersConfigured = () => ({
  youtube: !!env("YOUTUBE_API_KEY"),
  spotify: !!(env("SPOTIFY_CLIENT_ID") && env("SPOTIFY_CLIENT_SECRET")),
  spotifyLogin: !!(env("SPOTIFY_CLIENT_ID") && env("SPOTIFY_CLIENT_SECRET") && env("SESSION_SECRET")),
  soundcloud: !!(env("SOUNDCLOUD_CLIENT_ID") && env("SOUNDCLOUD_CLIENT_SECRET")),
  apple: !!(env("APPLE_MUSIC_TEAM_ID") && env("APPLE_MUSIC_KEY_ID") && env("APPLE_MUSIC_PRIVATE_KEY")),
});
