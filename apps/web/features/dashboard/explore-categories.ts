import { CreditCard, Landmark, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { components } from "@contracts/generated/schema";

type ProductCategory = components["schemas"]["ProductCategory"];

// Product categories surfaced on the Explore hub (/dashboard/explore). Each
// links to /dashboard/explore/[slug], which lists the Admin-published products
// in that category from the public financial-products catalogue
// (lib/financial-catalog.ts). `icon` stays in every entry because the
// collapsed 16px sidebar rail needs a legible glyph where a detailed
// illustration would not read; `illustration` is the 320x240 spot art used on
// the hub tile and reused as a fallback plate on the category grid. Shared by
// the hub grid, the sidebar accordion, and the [slug] detail page so all three
// never drift.
export type ExploreCategory = {
  slug: string;
  label: string;
  icon: LucideIcon;
  illustration: string;
  category: ProductCategory;
  // Short line for the hub tile.
  blurb: string;
};

export const EXPLORE_CATEGORIES: ExploreCategory[] = [
  {
    slug: "loans",
    label: "Loans",
    icon: Landmark,
    illustration: "/images/services/personal-loan.webp",
    category: "loan",
    blurb: "Home, personal, business and gold loans.",
  },
  {
    slug: "insurance",
    label: "Insurance",
    icon: ShieldCheck,
    illustration: "/images/services/health-insurance.webp",
    category: "insurance",
    blurb: "Health, life, motor and term cover.",
  },
  {
    slug: "cards",
    label: "Credit Cards",
    icon: CreditCard,
    illustration: "/images/services/credit-cards.webp",
    category: "credit_card",
    blurb: "Cards matched to your profile and spend.",
  },
];

export function getExploreCategory(slug: string): ExploreCategory | undefined {
  return EXPLORE_CATEGORIES.find((c) => c.slug === slug);
}

// Skip the category only when exactly one published card product exists.
export function shouldSkipCardsCategoryList(categorySlug: string, itemCount: number): boolean {
  return categorySlug === "cards" && itemCount === 1;
}
