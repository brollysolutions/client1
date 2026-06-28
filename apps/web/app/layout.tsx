import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, Space_Grotesk, Newsreader } from "next/font/google";
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
  title: "Loans & Real Estate Platform",
  description: "Role-based loans and real estate operations platform.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} ${newsreader.variable}`}>
      <body className="antialiased min-h-screen bg-background text-text-primary">
        {children}
      </body>
    </html>
  );
}
