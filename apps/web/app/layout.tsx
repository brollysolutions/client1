import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Space_Grotesk, Geist } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

// Space Grotesk is the body default (globals.css `body`) and every
// `font-heading` utility (100+ sites). Inter (--font-body) and Newsreader
// (--font-display) were loaded here but no component ever applied
// `font-body`/`font-display`, so they were three render-blocking font
// downloads per page for zero painted glyphs. Dropped.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

// Geist backs `font-geist` (nav links, eyebrows, labels — 14 sites). It was
// referenced in globals.css but never loaded here, so those elements were
// silently falling back to the browser's generic sans-serif.
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

export const metadata: Metadata = {
  // Absolute base for canonical URLs, Open Graph, the sitemap, and JSON-LD.
  metadataBase: new URL(SITE_URL),
  title: "Loans & Real Estate Platform",
  description: "Role-based loans and real estate operations platform.",
};

// This is a light-only design. Emitting <meta name="color-scheme" content="light">
// stops browsers from auto-darkening pages (which was turning the sparse
// dashboard near-black).
export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#F3F3EE",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${geist.variable}`}>
      <body className="antialiased min-h-screen bg-background text-text-primary">
        {/* AuthProvider is mounted per route group ((auth) + (app)) so public
            marketing pages never fire a session refresh. Toaster stays global. */}
        {children}
        <Toaster />
      </body>
    </html>
  );
}
