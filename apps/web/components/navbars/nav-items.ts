import { Briefcase, Building2, Home, Key, Tag, Wallet, type LucideIcon } from "lucide-react";

// Anchors point at landing sections that don't exist yet (navbar-only pass) —
// they're intentional no-ops until hero/Loans/Real Estate/etc. land. Children
// are dropdown sub-links; leaf items (Calculator, Contact) render as plain links.
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
  {
    label: "Loans",
    href: "#loans",
    children: [
      { label: "Home Loan", href: "#home-loan", description: "Buy, build, or transfer your home loan.", icon: Home },
      { label: "Personal Loan", href: "#personal-loan", description: "Quick funds for planned expenses.", icon: Wallet },
      { label: "Business Loan", href: "#business-loan", description: "Working capital and growth finance.", icon: Briefcase },
    ],
  },
  {
    label: "Real Estate",
    href: "#real-estate",
    children: [
      { label: "Buy Property", href: "#buy", description: "Verified plots, flats, and commercial spaces.", icon: Key },
      { label: "Rent", href: "#rent", description: "Homes and offices ready to move in.", icon: Building2 },
      { label: "List Property", href: "#list", description: "List your property with our agents.", icon: Tag },
    ],
  },
  { label: "Calculator", href: "#calculator" },
  { label: "Contact", href: "#contact" },
];
