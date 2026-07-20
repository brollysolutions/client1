import { CreditCard, Landmark, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Product categories surfaced on the Explore hub (/dashboard/explore). Each opens
// a coming-soon detail for now; real catalogs land in later phases. Shared by the
// hub grid and the [slug] detail page so the two never drift.
export type ExploreCategory = {
  slug: string;
  label: string;
  icon: LucideIcon;
  // Short line for the hub tile.
  blurb: string;
  // Longer copy for the coming-soon detail.
  description: string;
};

export const EXPLORE_CATEGORIES: ExploreCategory[] = [
  {
    slug: "loans",
    label: "Loans",
    icon: Landmark,
    blurb: "Home, personal, business and gold loans.",
    description:
      "Browse loan products matched to your needs, compare rates, and start an application, all from one place. This catalog is on its way.",
  },
  {
    slug: "cards",
    label: "Credit Cards",
    icon: CreditCard,
    blurb: "Cards matched to your profile and spend.",
    description:
      "Discover credit cards suited to your spending and goals, with rewards and fees laid out side by side. Card discovery is coming soon.",
  },
  {
    slug: "insurance",
    label: "Insurance",
    icon: ShieldCheck,
    blurb: "Health, life, motor and term cover.",
    description:
      "Explore health, life, motor and term insurance, and find cover that fits your family and budget. Insurance plans are coming soon.",
  },
];

export function getExploreCategory(slug: string): ExploreCategory | undefined {
  return EXPLORE_CATEGORIES.find((c) => c.slug === slug);
}
