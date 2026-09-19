import type { Metadata } from "next";
import "@fontsource-variable/source-sans-3";
import "@fontsource-variable/newsreader";
import "@fontsource/space-mono/latin.css"; // normal-style, 400+700 only — no italic needed
import "./globals.css";
import { ThemeScript } from "@/components/ThemeScript";
import { PrivacyScript } from "@/components/PrivacyScript";

// "Amber Noir" theme's font trio — self-hosted via @fontsource (npm
// packages that ship the actual woff2 files) rather than next/font/google,
// which calls out to fonts.googleapis.com at build time — a host this
// sandbox's network policy blocks. @fontsource gives the same outcome
// (fonts served from our own domain, no runtime Google request) without
// needing that fetch. Registers @font-face rules under "Source Sans 3
// Variable" / "Newsreader Variable" / "Space Mono", referenced by name in
// globals.css's --font-ui/--font-data/--font-display (which previously
// named "Inter"/"IBM Plex Mono"/"Fraunces" but never actually loaded any
// of them, so every browser was silently falling back to system fonts).
export const metadata: Metadata = {
  title: "The Backroom — Member Desk",
  description: "Trading journal, analytics, and prop-firm tools for The Backroom.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
        <PrivacyScript />
      </head>
      <body>{children}</body>
    </html>
  );
}
