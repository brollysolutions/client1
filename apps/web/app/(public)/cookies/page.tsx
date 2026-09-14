import { SITE_NAME } from "@/lib/site";
import type { Metadata } from "next";
import { CookiesContent } from "@/components/help/cookies-content";
export const metadata: Metadata = {
  title: "Cookie Notice",
  description: `The cookies and browser storage ${SITE_NAME} uses, why they are needed, and the choices available to you.`,
  alternates: { canonical: "/cookies" },
  openGraph: {
    title: "Cookie Notice",
    description: `The cookies and browser storage ${SITE_NAME} uses and why they are needed.`,
    type: "website",
    url: "/cookies",
  },
};
export default function Page() { return <CookiesContent />; }
