import { type LucideIcon } from "lucide-react";

// Loans, Real Estate, Earn with Us, Calculator, and Application are all
// dedicated pages; their product lists live on those pages now (see
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
  { label: "Loans", href: "/loans" },
  { label: "Properties", href: "/real-estate" },
  { label: "Earn with Us", href: "/earn-with-us" },
  { label: "Calculator", href: "/calculators" },
  { label: "Application", href: "/apply-as-agent" },
];
