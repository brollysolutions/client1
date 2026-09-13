import { type LucideIcon } from "lucide-react";

import { CALCULATORS_MENU, CALCULATORS_OVERVIEW } from "@/components/navbars/calculators-menu";
import {
  FINANCIAL_SERVICES_MENU,
  FINANCIAL_SERVICES_OVERVIEW,
} from "@/components/navbars/financial-services-menu";
import { PROPERTIES_MENU, PROPERTIES_OVERVIEW } from "@/components/navbars/properties-menu";

// Desktop and mobile share the same order, grouped destinations and overview
// links. Contact sits in the header actions beside Register.
export type NavChild = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Optional catalogue artwork reference; navbar renderers use icons only. */
  illustration?: string;
};

export type NavGroup = {
  heading: string;
  key: string;
  items: NavChild[];
};

/** One desktop mega-panel column of one or more stacked, separately headed
 *  groups (e.g. Insurance + Credit Cards share a column). Desktop-only
 *  structure; mobile-nav.tsx flattens columns back into a flat group list. */
export type NavColumn = {
  groups: NavGroup[];
};

export type NavItem = {
  label: string;
  href: string;
  /** Renders as a mega-menu trigger instead of a plain link. `href` still
   *  drives active-state matching and is the menu's overview destination. */
  menu?: { columns: NavColumn[]; overview: { label: string; href: string } };
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/" },
  // Label is broader than the /loans route because that page carries the whole
  // consumer-finance line — loans plus the credit-cards and insurance products
  // in lib/products.ts. The href stays /loans: renaming an indexed public path
  // costs SEO for no user-facing gain, and active-state matching in
  // site-header/mobile-nav is driven by href, not label.
  {
    label: "Financial Services",
    href: "/loans",
    menu: {
      columns: FINANCIAL_SERVICES_MENU,
      overview: FINANCIAL_SERVICES_OVERVIEW,
    },
  },
  {
    label: "Properties",
    href: "/real-estate",
    menu: { columns: PROPERTIES_MENU, overview: PROPERTIES_OVERVIEW },
  },
  {
    label: "Calculators", href: "/calculators",
    menu: { columns: CALCULATORS_MENU, overview: CALCULATORS_OVERVIEW },
  },
  { label: "Earn with Us", href: "/earn-with-us" },
  { label: "Become a Partner", href: "/apply-as-agent" },
];
