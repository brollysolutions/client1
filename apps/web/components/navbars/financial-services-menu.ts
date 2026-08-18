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
  /** Product spot illustration, reused as the desktop mega-menu thumbnail so
   *  the menu and the /loans cards share one art source. The Lucide `icon`
   *  stays the mobile-drawer glyph (illustrations are lg+ only). */
  illustration?: string;
};

export type FinancialServiceGroup = {
  heading: string;
  /** Stable key for React and for the column heading's aria-labelledby id. */
  key: ProductGroup;
  items: FinancialServiceLink[];
};

/** One desktop mega-panel column, holding one or more stacked, separately
 *  headed groups. Credit Cards shares a column with Insurance rather than
 *  getting its own: a column holding a single item and nothing else read as
 *  a rendering bug (an isolated highlight tile was tried and rejected).
 *  Desktop-only structure — the mobile drawer renders every group as its
 *  own flat top-level section regardless of column grouping (see
 *  mobile-nav.tsx, which flattens columns back into a group list). */
export type FinancialServiceColumn = {
  groups: FinancialServiceGroup[];
};

const GROUP_DEFS: { key: ProductGroup; heading: string }[] = [
  { key: "loans", heading: "Loans" },
  { key: "insurance", heading: "Insurance" },
  { key: "credit-cards", heading: "Credit Cards" },
];

const [loansGroup, insuranceGroup, creditCardsGroup] = GROUP_DEFS.map(
  (group) => ({
    ...group,
    items: LOAN_PRODUCTS.filter((product) => product.group === group.key).map(
      (product) => ({
        label: product.navLabel ?? product.label,
        href: `/loans#${product.id}`,
        icon: product.icon,
        illustration: product.illustration,
      }),
    ),
  }),
);

export const FINANCIAL_SERVICES_MENU: FinancialServiceColumn[] = [
  { groups: [loansGroup] },
  { groups: [insuranceGroup, creditCardsGroup] },
];

export const FINANCIAL_SERVICES_OVERVIEW = {
  label: "View all financial services",
  href: "/loans",
} as const;
