import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * The site is a static export served by Cloudflare Pages: `next build` writes
 * plain files to `out/`. The API under /api is a Pages Function
 * (`functions/api/[[path]].ts`), and security headers come from
 * `public/_headers`.
 *
 * During `next dev`, /api is forwarded to the local Pages Functions server
 * started by `npm run dev:api`.
 */
const nextConfig: NextConfig = {
  output: isDev ? undefined : "export",
  poweredByHeader: false,
  reactStrictMode: true,
  images: { unoptimized: true },
  ...(isDev && {
    async rewrites() {
      return [{ source: "/api/:path*", destination: "http://127.0.0.1:8788/api/:path*" }];
    },
  }),
};

export default nextConfig;
