import { type LucideIcon } from "lucide-react";

// Loans, Real Estate, Earn with Us, and Calculator are dedicated pages; their
// product lists live on those pages now (see lib/products.ts), not in a navbar
// dropdown. Contact is still a landing-section anchor until that section gets
// its own page. `children` is retained on the type so the generic dropdown
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
  { label: "Earn with Us", href: "/earn-with-us" },
  { label: "Calculator", href: "/calculators" },
  { label: "Contact", href: "/#contact" },
];
