import type { Metadata } from "next";

import { OfferStrip } from "@/components/offer-strip";
import { ProductPage } from "@/components/product-page";
import { faqPageJsonLd, LOAN_FAQ_ITEMS } from "@/lib/faq";
import { getPublicOffers } from "@/lib/public-offers";
import { LOAN_JOURNEY, LOAN_PRODUCTS, LOAN_TRUST } from "@/lib/products";
import { SITE_NAME, SITE_URL } from "@/lib/site";

// First server-side data fetch on this page. Matches /real-estate's ISR
// window: CMS-authored content is human-paced, not real-time, so a five
// minute regeneration keeps the page from needing a redeploy to show a new
// offer without adding meaningful load (at most ~12 requests/hour from the
// web container, regardless of visitor volume).
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Loans: Personal, Business, Property, Vehicle & Education",
  description:
    "Explore personal, business, property, vehicle and education loans, plus credit cards and insurance, all matched to you by KYC-verified partners. See how applying works.",
  keywords: [
    "personal loan",
    "business loan",
    "property loan",
    "vehicle loan",
    "education loan",
    "credit cards",
    "insurance",
    "apply for loan",
  ],
  alternates: { canonical: "/loans" },
  openGraph: {
    title: "Loans: Personal, Business, Property, Vehicle & Education",
    description:
      "Compare loans, credit cards, and insurance from KYC-verified partners, and see exactly what happens when you apply.",
    type: "website",
  },
};

const loansJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
        {
          "@type": "ListItem",
          position: 2,
          name: "Loans",
          item: `${SITE_URL}/loans`,
        },
      ],
    },
    faqPageJsonLd(LOAN_FAQ_ITEMS),
  ],
  publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
};

export default async function LoansPage() {
  const offers = await getPublicOffers();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(loansJsonLd) }}
      />
      <ProductPage
        title="Loans, cards, and insurance that fit you"
        intro="From personal and business loans to property, vehicle, and education finance, we bring the options together and help you until the money reaches your account."
        heroDoodles
        productsHeading="Explore our services"
        productColumns={4}
        productDoodles
        productsTrustEyebrow="Why people trust us"
        productsTrust={LOAN_TRUST}
        productsCta={{
          title: "Not sure which loan fits?",
          text: "Tell us what you need and an advisor will call you back to match you with the right lender.",
          label: "Talk to an advisor",
        }}
        products={LOAN_PRODUCTS}
        beforeJourney={
          <OfferStrip
            offers={offers}
            line="loans"
            heading="Offers running right now"
            subheading="Live discounts on the loans, cards, and insurance we help you apply for."
          />
        }
        journeyHeading="What happens when you apply?"
        journey={LOAN_JOURNEY}
        journeyTimeline
        faq={{
          heading: "Loan questions, answered",
          subheading: "What borrowers usually ask before applying.",
          items: LOAN_FAQ_ITEMS,
        }}
        ctaHeading="Ready to get started?"
        ctaText="Leave your number and our loans team will call you back to match you with the right lender."
        ctaLabel="Get a callback"
        ctaBanner
        businessLine="loans"
      />
    </>
  );
}
