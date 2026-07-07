import type { Metadata } from "next";

import { ProductPage } from "@/components/product-page";
import { LOAN_JOURNEY, LOAN_PRODUCTS, LOAN_TRUST } from "@/lib/products";

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

export default function LoansPage() {
  return (
    <ProductPage
      title="Find the loan that fits you"
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
      journeyHeading="What happens when you apply?"
      journey={LOAN_JOURNEY}
      journeyTimeline
      ctaHeading="Ready to get started?"
      ctaText="Leave your number and our loans team will call you back to match you with the right lender."
      ctaLabel="Get a callback"
      ctaBanner
      businessLine="loans"
    />
  );
}
