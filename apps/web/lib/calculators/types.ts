import type { LeadBusinessLine } from "@/lib/leads";

// A calculator is described declaratively here (SEO, copy, FAQ, links, lead
// hand-off, illustration) and imperatively by its client island (the actual
// inputs + math UI, wired in lib/calculators/islands.ts). One generic route,
// app/(public)/calculators/[slug]/page.tsx, renders any calculator from its
// registry entry, so adding one is a single entry + one island component.

export type CalculatorSlug =
  | "emi"
  | "loan-eligibility"
  | "prepayment"
  | "loan-comparison"
  | "loan-against-property"
  | "home-affordability"
  | "stamp-duty"
  | "gst"
  | "property-appreciation"
  | "rental-yield"
  | "down-payment-planner";

export interface CalculatorFaq {
  q: string;
  a: string;
}

export interface CalculatorDef {
  slug: CalculatorSlug;
  /** Which hub column and which lead team this belongs to. */
  group: "loans" | "real_estate";
  businessLine: LeadBusinessLine;
  /** Short label for hub cards, breadcrumbs, and related-links. */
  navLabel: string;
  /** One-line hub-card description. */
  cardSummary: string;
  h1: string;
  /** <title> text (brand appended by the route). */
  title: string;
  metaDescription: string;
  keywords: string[];
  /** Crawlable lead paragraph rendered under the H1. */
  intro: string;
  /** "How it's calculated" explainer (plain text, may contain the formula). */
  howItWorks: string;
  /**
   * Hero illustration path under /public (Storyset Rafiki, recolored to the
   * public blue). Optional: the hero art component falls back to a hand-coded
   * SVG motif when absent, so the page renders before assets land.
   */
  heroArt?: string;
  faq: CalculatorFaq[];
  relatedSlugs: CalculatorSlug[];
  /** Lead origin tag, e.g. "calculator-emi". */
  leadOrigin: string;
  leadCta: {
    heading: string;
    text: string;
    triggerLabel: string;
    submitLabel: string;
  };
}
