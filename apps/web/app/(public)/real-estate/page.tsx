import type { Metadata } from "next";

import { ProductPage, PropertyDoodles } from "@/components/product-page";
import { PropertyRow } from "@/components/property-row";
import { TrustStrip } from "@/components/trust-strip";
import { RE_TRUST, REAL_ESTATE_JOURNEY } from "@/lib/products";
import { BUY_LISTINGS, RENT_LISTINGS } from "@/lib/properties";

export const metadata: Metadata = {
  title: "Properties: Buy or Rent Verified Homes in India",
  description:
    "Buy or rent verified homes, plots, and commercial spaces with trusted agents. See what you can buy or rent and how we guide you from first visit to final paperwork.",
  keywords: [
    "buy property",
    "rent home",
    "buy home",
    "rent flat",
    "real estate",
    "verified property",
    "property agents",
  ],
  alternates: { canonical: "/real-estate" },
  openGraph: {
    title: "Properties: Buy or Rent Verified Homes in India",
    description:
      "Verified homes and trusted agents in one place, with one point of contact guiding you from first visit to final paperwork.",
    type: "website",
  },
};

export default function RealEstatePage() {
  return (
    <ProductPage
      title="Find the property that fits you"
      intro="From homes and plots to offices and shops, we bring only verified listings and trusted agents together in one place. We stay with you at every step, from the first visit until you hold the keys."
      heroDoodles
      heroPlant="/illustrations/doodles/tree-house.svg"
      beforeJourney={
        <div className="relative w-full border-t border-[var(--nav-border)] bg-[var(--nav-bg)] py-20 sm:py-24 lg:py-28">
          <PropertyDoodles />
          <div className="relative z-10 space-y-20 sm:space-y-24">
            <PropertyRow
              heading="Properties to buy"
              types="Flats, plots, villas, and commercial spaces."
              listings={BUY_LISTINGS}
            />
            <PropertyRow
              heading="Properties for rent"
              types="Homes, PGs, offices, and shops ready to move in."
              listings={RENT_LISTINGS}
            />
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <TrustStrip eyebrow="Why people trust us" points={RE_TRUST} />
            </div>
          </div>
        </div>
      }
      journeyHeading="What happens when you reach out"
      journey={REAL_ESTATE_JOURNEY}
      journeyTimeline
      ctaHeading="Ready to find your place?"
      ctaText="Leave your number and our real estate team will call you back about buying or renting."
      ctaLabel="Get a callback"
      ctaBanner
      businessLine="real_estate"
    />
  );
}
