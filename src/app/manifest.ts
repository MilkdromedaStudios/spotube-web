import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Spotube Web",
    short_name: "Spotube",
    description: "Open-source web music player based on Spotube.",
    start_url: "/",
    display: "standalone",
    background_color: "#d8fff0",
    theme_color: "#a7e8ff",
    icons: [
      { src: "/brand-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
    ],
  };
}
