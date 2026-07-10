import type { Metadata } from "next";

import { ClosingCta } from "@/components/closing-cta";
import { AGENT_FAQ_ITEMS, EarnFaq } from "@/components/earn-with-us/agent-faq";
import { EarnAgentTracks } from "@/components/earn-with-us/agent-tracks";
import { EarnEligibility } from "@/components/earn-with-us/eligibility";
import { EarnHero } from "@/components/earn-with-us/hero";
import { EarnHowItWorks } from "@/components/earn-with-us/how-earning-works";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Become a Loan Agent or Real Estate Agent | Earn with Us",
  description:
    "Apply to become a loan DSA or real estate referral agent in India. Free to apply, KYC verified, and you earn commission on every deal you bring us.",
  keywords: [
    "become a loan agent",
    "loan DSA registration",
    "real estate agent registration India",
    "RERA agent code",
    "real estate referral agent",
    "loan agent commission",
    "agent partner program",
  ],
  alternates: { canonical: "/earn-with-us" },
  openGraph: {
    title: "Become a Loan Agent or Real Estate Agent | Earn with Us",
    description:
      "Apply to become a loan DSA or real estate referral agent in India. Free to apply, KYC verified, and you earn commission on every deal you bring us.",
    type: "website",
    url: "/earn-with-us",
  },
};

const earnWithUsJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
        {
          "@type": "ListItem",
          position: 2,
          name: "Earn with Us",
          item: `${SITE_URL}/earn-with-us`,
        },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: AGENT_FAQ_ITEMS.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
  publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
};

export default function EarnWithUsPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(earnWithUsJsonLd) }}
      />
      <EarnHero />
      <EarnEligibility />
      <EarnHowItWorks />
      <EarnAgentTracks />
      <EarnFaq />
      <ClosingCta
        heading="Ready to start earning?"
        text="Apply in a few minutes. We'll verify your KYC and get you started."
        ctaLabel="Apply to become an agent"
        origin="agent-application-page"
        id="apply"
      />
    </>
  );
}
