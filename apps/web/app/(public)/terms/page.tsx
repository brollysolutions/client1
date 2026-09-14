import { SITE_NAME } from "@/lib/site";
import type { Metadata } from "next";
import { TermsContent } from "@/components/help/terms-content";
export const metadata: Metadata = {
  title: "Terms of Use",
  description: `The terms for using ${SITE_NAME}'s website and services.`,
  alternates: { canonical: "/terms" },
  openGraph: {
    title: "Terms of Use",
    description: `The terms for using ${SITE_NAME}'s website and services.`,
    type: "website",
    url: "/terms",
  },
};
export default function Page() { return <TermsContent />; }
