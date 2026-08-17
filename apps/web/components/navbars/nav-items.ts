import { type LucideIcon } from "lucide-react";

// Financial Services, Real Estate, Earn with Us, Calculator, and Application are
// all dedicated pages; their product lists live on those pages now (see
// lib/products.ts), not in a navbar dropdown. Contact is not a center nav item;
// it sits in the header actions beside Register (see site-header/mobile-nav).
// `children` is retained on the type so the generic dropdown renderer in
// site-header/mobile-nav keeps working if a future item needs it.
export type NavChild = {
  label: string;
  href: string;
  description: string;
  icon: LucideIcon;
};

export type NavItem = {
  label: string;
  href: string;
  children?: NavChild[];
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/" },
  // Label is broader than the /loans route because that page carries the whole
  // consumer-finance line — loans plus the credit-cards and insurance products
  // in lib/products.ts. The href stays /loans: renaming an indexed public path
  // costs SEO for no user-facing gain, and active-state matching in
  // site-header/mobile-nav is driven by href, not label.
  { label: "Financial Services", href: "/loans" },
  { label: "Properties", href: "/real-estate" },
  { label: "Earn with Us", href: "/earn-with-us" },
  { label: "Calculator", href: "/calculators" },
  { label: "Become a Partner", href: "/apply-as-agent" },
];
