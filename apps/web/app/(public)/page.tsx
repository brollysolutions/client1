import type { Metadata } from "next";

import { ClosingCta } from "@/components/closing-cta";
import { FaqSection } from "@/components/faq-section";
import { FloatingDoodles } from "@/components/floating-doodles";
import { HeroCarousel } from "@/components/hero-carousel";
import { HowItWorks } from "@/components/how-it-works";
import { LineSplit } from "@/components/line-split";
import { PartnerCta } from "@/components/partner-cta";
import { WhyChooseUs } from "@/components/why-choose-us";
import { faqPageJsonLd, HOME_FAQ_ITEMS } from "@/lib/faq";
import { SITE_NAME, SITE_URL } from "@/lib/site";

// Landing-scoped SEO metadata. Overrides the generic root-layout default
// (which stays as the internal fallback for authenticated dashboard routes).
export const metadata: Metadata = {
  title: "Loans & Real Estate: Compare Personal, Business & Property Loans",
  description:
    "Compare personal, business, property, vehicle and education loans, plus credit cards and insurance, all matched to you by KYC-checked partners. Check your eligibility.",
  keywords: [
    "personal loan",
    "business loan",
    "property loan",
    "vehicle loan",
    "education loan",
    "credit cards",
    "insurance",
    "real estate",
    "compare loans",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    title: "Loans & Real Estate: Compare Personal, Business & Property Loans",
    description:
      "Personal, business, property, vehicle and education loans, plus credit cards and insurance. Verified lenders and real estate, all in one place.",
    type: "website",
  },
};

const homeFaqJsonLd = {
  "@context": "https://schema.org",
  "@graph": [faqPageJsonLd(HOME_FAQ_ITEMS)],
  publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeFaqJsonLd) }}
      />
      {/* Single crawlable H1 for the page. The hero and section headings are all
          H2s, so this gives the document a proper outline without changing the
          visual design (hero copy stays the visual focal point). */}
      <h1 className="sr-only">
        Compare personal, business, property, vehicle and education loans, credit
        cards, insurance, and verified real estate in one place
      </h1>
      <HeroCarousel />
      {/* Floating natural-color finance doodles overlay the LineSplit bands and the
          WhyChooseUs bento (lg+, pointer-events-none), hugging the outer gutters. */}
      <div className="relative">
        <LineSplit />
        <FloatingDoodles />
      </div>
      <HowItWorks />
      <div className="relative">
        <WhyChooseUs />
        <FloatingDoodles subset={[0, 1, 3]} />
      </div>
      <PartnerCta />
      <FaqSection
        heading="Frequently asked questions"
        subheading="Answers to what people usually ask before they get started."
        items={HOME_FAQ_ITEMS}
      />
      <ClosingCta href="/contact" />
    </>
  );
}
