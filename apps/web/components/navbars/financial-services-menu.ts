import { type LucideIcon } from "lucide-react";

import { LOAN_PRODUCTS, type ProductGroup } from "@/lib/products";

// Data-joining for the navbar's Financial Services mega-menu. Mirrors
// components/footer-links.ts's convention: this file owns the join against
// lib/products.ts, so the desktop (site-header.tsx) and mobile
// (mobile-nav.tsx) renderers stay purely presentational.
//
// Unlike footer-links.ts's findLoanLink (which looks up by id and can miss),
// this filters LOAN_PRODUCTS by group, so it can never silently drop a
// product — a new product with a group automatically appears here.

export type FinancialServiceLink = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export type FinancialServiceGroup = {
  heading: string;
  /** Stable key for React and for the column heading's aria-labelledby id. */
  key: ProductGroup;
  /** "list" = icon+label rows. "tile" = one full-height highlight tile, used
   *  for the single-item Credit Cards column (a lone list row in a tall
   *  column reads as a rendering bug). Desktop-only distinction: the mobile
   *  drawer renders every group as a flat list regardless of this value. */
  layout: "list" | "tile";
  items: FinancialServiceLink[];
};

const GROUPS: { key: ProductGroup; heading: string; layout: "list" | "tile" }[] = [
  { key: "loans", heading: "Loans", layout: "list" },
  { key: "insurance", heading: "Insurance", layout: "list" },
  { key: "credit-cards", heading: "Credit Cards", layout: "tile" },
];

export const FINANCIAL_SERVICES_MENU: FinancialServiceGroup[] = GROUPS.map(
  (group) => ({
    ...group,
    items: LOAN_PRODUCTS.filter((product) => product.group === group.key).map(
      (product) => ({
        label: product.navLabel ?? product.label,
        href: `/loans#${product.id}`,
        icon: product.icon,
      }),
    ),
  }),
);

export const FINANCIAL_SERVICES_OVERVIEW = {
  label: "View all financial services",
  href: "/loans",
} as const;
