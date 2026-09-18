import type { Metadata } from "next";
import "./globals.css";
import { ThemeScript } from "@/components/ThemeScript";
import { PrivacyScript } from "@/components/PrivacyScript";

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
