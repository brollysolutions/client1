import {
  Briefcase,
  Car,
  CreditCard,
  FileCheck,
  GraduationCap,
  Handshake,
  HardHat,
  HeartPulse,
  Home,
  Landmark,
  LineChart,
  Lock,
  Plane,
  School,
  ShieldCheck,
  Stethoscope,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";

// Single source of truth for the public Loans and Real Estate marketing pages
// (app/(public)/loans, app/(public)/real-estate). These lists also drive the
// navbar's Financial Services mega-menu (components/navbars/financial-services-menu.ts),
// which joins against `group`, `navLabel`, and `id` rather than duplicating a
// second hand-maintained list. See .agent-workflow/DECISIONS.md for the
// rationale on reintroducing a navbar dropdown after commit 45d9573 removed it.
// Copy follows apps/web/CLAUDE.md content rules: humanized, no em/en dashes,
// short direct sentences.

export type ProductGroup = "loans" | "insurance" | "credit-cards";

export type Product = {
  /** Stable slug, also used as the card's scroll anchor id on /loans. */
  id: string;
  label: string;
  /** Short label for the mega-menu, where the column heading already says the
   *  category ("Personal", not "Personal Loan"). Falls back to `label`. */
  navLabel?: string;
  description: string;
  group: ProductGroup;
  icon: LucideIcon;
  // Optional card-size spot illustration (public/illustrations/products/*.svg).
  // When set, the card renders the illustration band; otherwise it falls back
  // to the lucide icon tile. Loans opt in; real estate uses the fallback.
  illustration?: string;
  /** Retired product id kept as an extra in-page anchor so old /loans#<id>
   *  links (bookmarks, off-site references) keep landing correctly. */
  legacyAnchorId?: string;
};

export type ProductBand = {
  /** Section anchor. Must never collide with any Product id. */
  id: string;
  heading: string;
  /** One-line intro rendered under the band heading. */
  description?: string;
  products: Product[];
  /** Solid-blue advisor CTA rendered as the final tile of this band. */
  cta?: { title: string; text: string; label: string };
  /** Product pulled out of the band grid and rendered as a full-width
   *  horizontal feature card after it. Must be an id from `products`. */
  featureProductId?: string;
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
    navLabel: "Personal",
    description:
      "A personal loan for planned expenses, from medical bills to a big purchase.",
    group: "loans",
    icon: Wallet,
    illustration: "/illustrations/products/personal-loan.svg",
  },
  {
    id: "business-loan",
    label: "Business Loan",
    navLabel: "Business",
    description:
      "A business loan for working capital, new equipment, or your next stage of growth.",
    group: "loans",
    icon: Briefcase,
    illustration: "/illustrations/products/business-loan.svg",
  },
  {
    id: "home-loan",
    label: "Home Loan",
    navLabel: "Home",
    description:
      "A home loan to buy, build, or transfer a house or flat, secured against the property.",
    group: "loans",
    icon: Home,
    illustration: "/illustrations/products/home-loan.svg",
    legacyAnchorId: "property-loan",
  },
  {
    id: "loan-against-property",
    label: "Loan Against Property",
    navLabel: "Against Property",
    description:
      "Unlock funds against a property you already own, while you keep living in or using it.",
    group: "loans",
    icon: Landmark,
    illustration: "/illustrations/products/loan-against-property.svg",
  },
  {
    id: "car-loan",
    label: "Car Loan",
    navLabel: "Car",
    description: "A car loan for a new or used private car, with quick approval.",
    group: "loans",
    icon: Car,
    illustration: "/illustrations/products/car-loan.svg",
  },
  {
    id: "vehicle-loan",
    label: "Vehicle Loan",
    navLabel: "Vehicle",
    description:
      "A vehicle loan for a two-wheeler or commercial vehicle, from bikes to trucks.",
    group: "loans",
    icon: Truck,
    illustration: "/illustrations/products/vehicle-loan.svg",
  },
  {
    id: "education-loan",
    label: "Education Loan",
    navLabel: "Education",
    description:
      "An education loan for tuition, living costs, and studies in India or abroad.",
    group: "loans",
    icon: GraduationCap,
    illustration: "/illustrations/products/education-loan.svg",
  },
  {
    id: "school-funding",
    label: "School Funding",
    navLabel: "School Funding",
    description:
      "Funding for school admission fees and annual costs, repaid over the school year.",
    group: "loans",
    icon: School,
    illustration: "/illustrations/products/school-funding.svg",
  },
  {
    id: "secured-loans",
    label: "Secured Loans",
    navLabel: "Secured",
    description:
      "Borrow against gold, fixed deposits, or other assets you pledge as security.",
    group: "loans",
    icon: Lock,
    illustration: "/illustrations/products/secured-loans.svg",
  },
  {
    id: "od-and-dod",
    label: "OD and DOD",
    navLabel: "OD and DOD",
    description:
      "Overdraft and drop-line overdraft facilities that give your business flexible, on-demand funds.",
    group: "loans",
    icon: LineChart,
    illustration: "/illustrations/products/od-and-dod.svg",
  },
  {
    id: "project-funding",
    label: "Project Funding",
    navLabel: "Project Funding",
    description:
      "Funding for construction and development projects, released against project milestones.",
    group: "loans",
    icon: HardHat,
    illustration: "/illustrations/products/project-funding.svg",
  },
  {
    id: "life-insurance",
    label: "Life Insurance",
    navLabel: "Life",
    description:
      "Life cover that protects your family's finances if something happens to you.",
    group: "insurance",
    icon: HeartPulse,
    illustration: "/illustrations/products/life-insurance.svg",
    // Not "legacyAnchorId: insurance" — that id belongs to the insurance BAND
    // (LOAN_PRODUCT_BANDS below), which already preserves the old
    // /loans#insurance anchor at the section level. Duplicating it here would
    // emit two elements with the same id.
  },
  {
    id: "health-insurance",
    label: "Health Insurance",
    navLabel: "Health",
    description:
      "Health cover for hospital bills and treatment, for you and your family.",
    group: "insurance",
    icon: Stethoscope,
    illustration: "/illustrations/products/health-insurance.svg",
  },
  {
    id: "property-insurance",
    label: "Property Insurance",
    navLabel: "Property",
    description:
      "Cover for your home or property against fire, theft, and other listed risks.",
    group: "insurance",
    icon: ShieldCheck,
    illustration: "/illustrations/products/property-insurance.svg",
  },
  {
    id: "travel-insurance",
    label: "Travel Insurance",
    navLabel: "Travel",
    description:
      "Cover for trip cancellations, medical emergencies, and lost baggage while you travel.",
    group: "insurance",
    icon: Plane,
    illustration: "/illustrations/products/travel-insurance.svg",
  },
  {
    id: "credit-cards",
    label: "Credit Cards",
    navLabel: "Credit Cards",
    description:
      "Compare credit cards, check what fits your spending, and apply online.",
    group: "credit-cards",
    icon: CreditCard,
    illustration: "/illustrations/products/credit-cards.svg",
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

// Band ids are namespaced ("loans"/"insurance") and deliberately distinct from
// every product id above; financial-services-menu.test.ts and products.test.ts
// both assert this, since a collision would emit duplicate DOM ids on /loans.
export const LOAN_PRODUCT_BANDS: ProductBand[] = [
  {
    id: "loans",
    heading: "Loans",
    description:
      "Eleven ways to borrow, from a quick personal loan to funding a whole project.",
    products: LOAN_PRODUCTS.filter((p) => p.group === "loans"),
    cta: {
      title: "Not sure which loan fits?",
      text: "Tell us what you need and an advisor will call you back to match you with the right lender.",
      label: "Talk to an advisor",
    },
  },
  {
    id: "insurance",
    heading: "Cards and insurance",
    description:
      "Protect what matters and spend smarter, through the same verified partners.",
    products: LOAN_PRODUCTS.filter(
      (p) => p.group === "insurance" || p.group === "credit-cards",
    ),
    // Credit Cards leaves this band's grid and renders as the full-width
    // feature card under the four insurance cards (see product-page.tsx).
    // The "Why people trust us" content that used to sit inside this band
    // now renders as a section-level TrustStrip below the whole grid,
    // passed to ProductPage by app/(public)/loans/page.tsx.
    featureProductId: "credit-cards",
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
