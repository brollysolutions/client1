import { type LucideIcon } from "lucide-react";

// Loans and Real Estate are dedicated pages (/loans, /real-estate); their
// product lists live on those pages now (see lib/products.ts), not in a navbar
// dropdown. Calculator and Contact are still landing-section anchors until those
// sections land. `children` is retained on the type so the generic dropdown
// renderer in site-header/mobile-nav keeps working if a future item needs it.
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
  { label: "Earn with Us", href: "/#partners" },
  { label: "Calculator", href: "/#calculator" },
  { label: "Contact", href: "/#contact" },
];
