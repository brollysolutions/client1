import { type LucideIcon } from "lucide-react";

import {
  FINANCIAL_SERVICES_MENU,
  FINANCIAL_SERVICES_OVERVIEW,
} from "@/components/navbars/financial-services-menu";
import { PROPERTIES_MENU, PROPERTIES_OVERVIEW } from "@/components/navbars/properties-menu";

// Real Estate, Earn with Us, Calculator, and Application are all dedicated
// pages with no navbar dropdown. Financial Services is the one exception: it
// carries 16 products (see lib/products.ts), too many to be discoverable from
// a single flat page alone, so it renders a mega-menu built from
// financial-services-menu.ts. This reverses the "children removed, dedicated
// pages only" decision from commit 45d9573 — see .agent-workflow/DECISIONS.md
// for the rationale. Contact is not a center nav item; it sits in the header
// actions beside Register (see site-header/mobile-nav).
export type NavChild = {
  label: string;
  href: string;
  icon: LucideIcon;
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
  { label: "Earn with Us", href: "/earn-with-us" },
  { label: "Calculator", href: "/calculators" },
  { label: "Become a Partner", href: "/apply-as-agent" },
];
