import type { Metadata } from "next";

import { ClosingCta } from "@/components/closing-cta";
import { EarnAgentTracks } from "@/components/earn-with-us/agent-tracks";
import { EarnEligibility } from "@/components/earn-with-us/eligibility";
import { EarnHero } from "@/components/earn-with-us/hero";
import { EarnHowItWorks } from "@/components/earn-with-us/how-earning-works";
import { ReferAndEarn } from "@/components/earn-with-us/refer-and-earn";
import { FaqSection } from "@/components/faq-section";
import { AGENT_FAQ_ITEMS, faqPageJsonLd } from "@/lib/faq";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Earn with Us: Agent Commission and Referral Cashback",
  description:
    "Become a loan DSA or real estate agent and earn commission, or refer friends and earn cashback when their deal completes. Free to join, KYC verified.",
  keywords: [
    "become a loan agent",
    "loan DSA registration",
    "real estate agent registration India",
    "RERA agent code",
    "real estate referral agent",
    "loan agent commission",
    "agent partner program",
    "refer and earn",
    "referral cashback",
  ],
  alternates: { canonical: "/earn-with-us" },
  openGraph: {
    title: "Earn with Us: Agent Commission and Referral Cashback",
    description:
      "Become a loan DSA or real estate agent and earn commission, or refer friends and earn cashback when their deal completes. Free to join, KYC verified.",
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
    faqPageJsonLd(AGENT_FAQ_ITEMS),
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
      <ReferAndEarn />
      <EarnEligibility />
      <EarnHowItWorks />
      <EarnAgentTracks />
      <FaqSection
        id="agent-faq"
        heading="Questions, answered"
        subheading="Agents and referrals, everything people usually ask."
        items={AGENT_FAQ_ITEMS}
      />
      <ClosingCta
        heading="Ready to start earning?"
        text="Apply as an agent in a few minutes, or sign in to use your referral code."
        ctaLabel="Apply to become an agent"
        origin="agent-application-page"
        id="apply"
      />
    </>
  );
}
