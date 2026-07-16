import {
  Briefcase,
  Car,
  CreditCard,
  FileCheck,
  GraduationCap,
  Handshake,
  Home,
  Lock,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";

// Single source of truth for the public Loans and Real Estate marketing pages
// (app/(public)/loans, app/(public)/real-estate). These lists were previously
// the navbar dropdown children; they now render as cards on the dedicated pages.
// Copy follows apps/web/CLAUDE.md content rules: humanized, no em/en dashes,
// short direct sentences.

export type Product = {
  /** Stable slug, also used as the card's scroll anchor id on /loans. */
  id: string;
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
    id: "personal-loan",
    label: "Personal Loan",
    description:
      "A personal loan for planned expenses, from medical bills to a big purchase.",
    icon: Wallet,
    illustration: "/illustrations/products/personal-loan.svg",
  },
  {
    id: "business-loan",
    label: "Business Loan",
    description:
      "A business loan for working capital, new equipment, or your next stage of growth.",
    icon: Briefcase,
    illustration: "/illustrations/products/business-loan.svg",
  },
  {
    id: "property-loan",
    label: "Property Loan",
    description:
      "A property loan to buy, build, or transfer, secured against your home or plot.",
    icon: Home,
    illustration: "/illustrations/products/property-loan.svg",
  },
  {
    id: "vehicle-loan",
    label: "Vehicle Loan",
    description:
      "A vehicle loan for a new or used car, two-wheeler, or commercial vehicle.",
    icon: Car,
    illustration: "/illustrations/products/vehicle-loan.svg",
  },
  {
    id: "education-loan",
    label: "Education Loan",
    description:
      "An education loan for tuition, living costs, and studies in India or abroad.",
    icon: GraduationCap,
    illustration: "/illustrations/products/education-loan.svg",
  },
  {
    id: "credit-cards",
    label: "Credit Cards",
    description:
      "Compare credit cards, check what fits your spending, and apply online.",
    icon: CreditCard,
    illustration: "/illustrations/products/credit-cards.svg",
  },
  {
    id: "insurance",
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

export const RE_TRUST: TrustPoint[] = [
  {
    icon: ShieldCheck,
    label: "Verified listings",
    note: "Every property and partner passes a background check first.",
  },
  {
    icon: Handshake,
    label: "A dedicated point of contact",
    note: "No new partner every time you call. One person handles your search.",
  },
  {
    icon: FileCheck,
    label: "Paperwork sorted early",
    note: "We check every document before you see the listing.",
  },
];

// Real estate buy categories and placeholder listings live in
// lib/properties.ts. Listing a property is an agent-side action, so it is not
// offered to clients on the public Properties page.

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
      "Tell us the kind of property you want to buy, your budget, and the areas you like.",
    image: "/illustrations/journey-re-look.svg",
  },
  {
    title: "See only verified options",
    description:
      "We show you properties and partners that are checked and verified before they reach you.",
    image: "/illustrations/journey-re-verified.svg",
  },
  {
    title: "One person guides you",
    description:
      "A single point of contact stays with you from the first visit to the final paperwork.",
    image: "/illustrations/journey-re-guide.svg",
  },
  {
    title: "Close with confidence",
    description:
      "Everything is verified in advance, so you reach the finish line with no surprises.",
    image: "/illustrations/journey-re-close.svg",
  },
];
