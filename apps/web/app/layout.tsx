import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Space_Grotesk, Geist } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

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
  icons: {
    icon: [{ url: "/brand/icon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/brand/icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  twitter: { card: "summary_large_image", images: ["/brand/social.png"] },
  title: `${SITE_NAME} | Loans and Real Estate`,
  description:
    "A clear, secure way to explore loans and real estate and connect with the right partner.",
};

// ThemeProvider keeps browser chrome synchronized with the chosen appearance.
export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: "#F0F7FC",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${spaceGrotesk.variable} ${geist.variable}`}>
      <body className="antialiased min-h-screen bg-background text-text-primary">
        {/* AuthProvider is mounted per route group ((auth) + (app)) so public
            marketing pages never fire a session refresh. Toaster stays global. */}
        <ThemeProvider>{children}<Toaster /></ThemeProvider>
      </body>
    </html>
  );
}
