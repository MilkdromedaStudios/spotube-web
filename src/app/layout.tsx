import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = {
  title: { default: "Spotube Web", template: "%s · Spotube Web" },
  description:
    "An open-source, ad-free web music player based on Spotube. Search YouTube, Spotify, SoundCloud and Apple Music and keep your library in your own browser.",
  applicationName: "Spotube Web",
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/brand-icon.svg", type: "image/svg+xml" }], apple: "/brand-icon.svg" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#a7e8ff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
