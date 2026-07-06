import type { Metadata } from "next";

import { ClosingCta } from "@/components/closing-cta";
import { Faq } from "@/components/faq";
import { FloatingDoodles } from "@/components/floating-doodles";
import { HeroCarousel } from "@/components/hero-carousel";
import { HowItWorks } from "@/components/how-it-works";
import { LineSplit } from "@/components/line-split";
import { PartnerCta } from "@/components/partner-cta";
import { WhyChooseUs } from "@/components/why-choose-us";

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

export default function Home() {
  return (
    <>
      {/* Single crawlable H1 for the page. The hero and section headings are all
          H2s, so this gives the document a proper outline without changing the
          visual design (hero copy stays the visual focal point). */}
      <h1 className="sr-only">
        Compare personal, business, property, vehicle and education loans, credit
        cards, insurance, and verified real estate in one place
      </h1>
      <HeroCarousel />
      {/* Floating doodles overlay the LineSplit bands only (not the hero, and not
          the HowItWorks / WhyChooseUs sections below); lg+, pointer-events-none. */}
      <div className="relative">
        <LineSplit />
        <FloatingDoodles />
      </div>
      <HowItWorks />
      <WhyChooseUs />
      <PartnerCta />
      <Faq />
      <ClosingCta />
    </>
  );
}
