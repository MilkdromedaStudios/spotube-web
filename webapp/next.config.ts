import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content Security Policy.
 *
 * This is the app's main privacy filter: only the official player SDKs and
 * APIs of the supported music providers may load scripts, frames or make
 * requests. Analytics, ad networks and any other third-party script are
 * blocked by the browser. Provider-served ads *inside* the official players are
 * not touched.
 */
const csp = [
  "default-src 'self'",
  [
    "script-src 'self' 'unsafe-inline'",
    isDev ? "'unsafe-eval'" : "",
    "https://www.youtube.com https://s.ytimg.com",
    "https://w.soundcloud.com",
    "https://open.spotify.com https://sdk.scdn.co",
    "https://js-cdn.music.apple.com",
  ].join(" "),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  [
    "connect-src 'self'",
    isDev ? "ws: wss:" : "",
    "https://api.spotify.com https://*.spotify.com wss://*.spotify.com https://*.scdn.co https://*.spotifycdn.com",
    "https://api.music.apple.com https://*.apple.com https://*.itunes.apple.com https://*.mzstatic.com",
  ].join(" "),
  [
    "media-src 'self' data: blob:",
    "https://*.scdn.co https://*.spotifycdn.com",
    "https://*.apple.com https://*.itunes.apple.com https://*.mzstatic.com",
  ].join(" "),
  [
    "frame-src",
    "https://www.youtube.com https://www.youtube-nocookie.com",
    "https://w.soundcloud.com",
    "https://open.spotify.com https://sdk.scdn.co",
    "https://*.apple.com",
  ].join(" "),
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.spotify.com",
  "frame-ancestors 'none'",
  isDev ? "" : "upgrade-insecure-requests",
]
  .filter(Boolean)
  .join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          // YouTube embeds require a referrer, so we keep the origin only.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=(), interest-cohort=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
    ];
  },
};

export default nextConfig;

