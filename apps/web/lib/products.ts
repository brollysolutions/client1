import {
  Briefcase,
  Building2,
  Car,
  CreditCard,
  GraduationCap,
  Handshake,
  Home,
  Key,
  Lock,
  ShieldCheck,
  Tag,
  Wallet,
  type LucideIcon,
} from "lucide-react";

// Single source of truth for the public Loans and Real Estate marketing pages
// (app/(public)/loans, app/(public)/real-estate). These lists were previously
// the navbar dropdown children; they now render as cards on the dedicated pages.
// Copy follows apps/web/CLAUDE.md content rules: humanized, no em/en dashes,
// short direct sentences.

export type Product = {
  label: string;
  description: string;
  icon: LucideIcon;
  // Optional card-size spot illustration (public/illustrations/products/*.svg).
  // When set, the card renders the illustration band; otherwise it falls back
  // to the lucide icon tile. Loans opt in; real estate uses the fallback.
  illustration?: string;
};

export type JourneyStep = {
  title: string;
  description: string;
  /** Decorative scene for the loans illustrated-band journey (lg+ only). */
  image?: string;
};

// Trust points shown as the premium strip under the products grid.
export type TrustPoint = {
  icon: LucideIcon;
  label: string;
  note: string;
};

export const LOAN_PRODUCTS: Product[] = [
  {
    label: "Personal Loan",
    description:
      "A personal loan for planned expenses, from medical bills to a big purchase.",
    icon: Wallet,
    illustration: "/illustrations/products/personal-loan.svg",
  },
  {
    label: "Business Loan",
    description:
      "A business loan for working capital, new equipment, or your next stage of growth.",
    icon: Briefcase,
    illustration: "/illustrations/products/business-loan.svg",
  },
  {
    label: "Property Loan",
    description:
      "A property loan to buy, build, or transfer, secured against your home or plot.",
    icon: Home,
    illustration: "/illustrations/products/property-loan.svg",
  },
  {
    label: "Vehicle Loan",
    description:
      "A vehicle loan for a new or used car, two-wheeler, or commercial vehicle.",
    icon: Car,
    illustration: "/illustrations/products/vehicle-loan.svg",
  },
  {
    label: "Education Loan",
    description:
      "An education loan for tuition, living costs, and studies in India or abroad.",
    icon: GraduationCap,
    illustration: "/illustrations/products/education-loan.svg",
  },
  {
    label: "Credit Cards",
    description:
      "Compare credit cards, check what fits your spending, and apply online.",
    icon: CreditCard,
    illustration: "/illustrations/products/credit-cards.svg",
  },
  {
    label: "Insurance",
    description:
      "Insurance for life, health, and assets, so your family and savings stay protected.",
    icon: ShieldCheck,
    illustration: "/illustrations/products/insurance.svg",
  },
];

export const LOAN_TRUST: TrustPoint[] = [
  {
    icon: ShieldCheck,
    label: "KYC-verified partners",
    note: "Every lending partner is verified before they reach you.",
  },
  {
    icon: Handshake,
    label: "We match, we don't lend",
    note: "We connect you with banks and lenders, we are not the lender.",
  },
  {
    icon: Lock,
    label: "Private by default",
    note: "Your details are shared only with your consent.",
  },
];

export const REAL_ESTATE_OFFERINGS: Product[] = [
  { label: "Buy Property", description: "Verified plots, flats, and commercial spaces.", icon: Key },
  { label: "Rent", description: "Homes and offices ready to move in.", icon: Building2 },
  { label: "List Property", description: "List your property with our agents.", icon: Tag },
];

export const LOAN_JOURNEY: JourneyStep[] = [
  {
    title: "Tell us what you need",
    description:
      "Pick a loan type and share a few basic details. It takes a couple of minutes.",
    image: "/illustrations/journey-tell-us.svg",
  },
  {
    title: "We match you",
    description:
      "We compare offers from KYC-verified banks and lenders and shortlist the ones that fit you.",
    image: "/illustrations/journey-match.svg",
  },
  {
    title: "We call you back",
    description:
      "An advisor helps you check eligibility, gather documents, and complete the application.",
    image: "/illustrations/journey-call.svg",
  },
  {
    title: "Money reaches your account",
    description:
      "Once your loan is approved and paperwork is done, the amount is disbursed to you.",
    image: "/illustrations/journey-money.svg",
  },
];

export const REAL_ESTATE_JOURNEY: JourneyStep[] = [
  {
    title: "Tell us what you are looking for",
    description:
      "Let us know whether you want to buy, rent, or list, and the kind of property you have in mind.",
  },
  {
    title: "See only verified options",
    description:
      "We show you homes and agents that are checked and verified before they reach you.",
  },
  {
    title: "One person guides you",
    description:
      "A single point of contact stays with you from the first visit to the final paperwork.",
  },
  {
    title: "Close with confidence",
    description:
      "Everything is verified in advance, so you reach the finish line with no surprises.",
  },
];
