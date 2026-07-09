import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, Space_Grotesk, Newsreader } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  style: ["normal", "italic"],
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
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} ${newsreader.variable}`}>
      <body className="antialiased min-h-screen bg-background text-text-primary">
        {/* AuthProvider is mounted per route group ((auth) + (app)) so public
            marketing pages never fire a session refresh. Toaster stays global. */}
        {children}
        <Toaster />
      </body>
    </html>
  );
}
