import type { Metadata } from "next";

import { ProductPage } from "@/components/product-page";
import { REAL_ESTATE_JOURNEY, REAL_ESTATE_OFFERINGS } from "@/lib/products";

export const metadata: Metadata = {
  title: "Real Estate: Buy, Rent, and List Verified Property",
  description:
    "Buy, rent, or list verified homes, plots, and commercial spaces with trusted agents. See how buying, renting, and listing work from first visit to final paperwork.",
  keywords: [
    "buy property",
    "rent home",
    "list property",
    "real estate",
    "verified property",
    "property agents",
  ],
  alternates: { canonical: "/real-estate" },
  openGraph: {
    title: "Real Estate: Buy, Rent, and List Verified Property",
    description:
      "Verified homes and trusted agents in one place, with one point of contact guiding you from first visit to final paperwork.",
    type: "website",
  },
};

export default function RealEstatePage() {
  return (
    <ProductPage
      eyebrow="Real Estate"
      title="Buy, rent, and list with confidence"
      intro="We show you only verified homes and agents, and guide you at every step so there are no surprises, whether you are buying, renting, or listing a property."
      productsHeading="What you can do here"
      products={REAL_ESTATE_OFFERINGS}
      journeyHeading="What happens when you reach out"
      journey={REAL_ESTATE_JOURNEY}
      ctaHeading="Ready to find your place?"
      ctaText="Leave your number and our real estate team will call you back about buying, renting, or listing."
      ctaLabel="Get a callback"
      businessLine="real_estate"
    />
  );
}
