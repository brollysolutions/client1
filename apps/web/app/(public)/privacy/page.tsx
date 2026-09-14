import { SITE_NAME } from "@/lib/site";
import type { Metadata } from "next";
import { PrivacyContent } from "@/components/help/privacy-content";
export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${SITE_NAME} collects, uses, and protects the information you share with us.`,
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: "Privacy Policy",
    description: `How ${SITE_NAME} collects, uses, and protects the information you share with us.`,
    type: "website",
    url: "/privacy",
  },
};
export default function Page() { return <PrivacyContent />; }
