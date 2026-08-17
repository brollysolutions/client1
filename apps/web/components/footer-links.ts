import { getCalculator } from "@/lib/calculators/registry";
import type { CalculatorSlug } from "@/lib/calculators/types";
import { LOAN_PRODUCTS } from "@/lib/products";
import { PROPERTY_CATEGORIES } from "@/lib/properties";

// Data-joining for the site footer's four link columns. Mirrors the
// components/navbars/nav-items.ts convention: this file owns the joins
// against the various registries, so site-footer.tsx stays purely
// presentational (just FOOTER_COLUMNS.map(...)).

export type FooterLink = { label: string; href: string };
export type FooterColumn = { heading: string; links: FooterLink[] };

// Core loan types only, deliberately excluding "credit-cards" and "insurance"
// (both still get real anchors on /loans via lib/products.ts, just not a
// footer link) — keeps the column matching the 5-row Loans column the
// mockup approved, rather than every card on the page.
const FOOTER_LOAN_IDS = [
  "personal-loan",
  "business-loan",
  "home-loan",
  "vehicle-loan",
  "education-loan",
] as const;

// Two calculators per line (EMI + Eligibility for loans, Stamp Duty + GST for
// real estate), so both lines are represented evenly and the Resources
// column's row count roughly matches the Loans column's.
const FOOTER_CALCULATOR_SLUGS: CalculatorSlug[] = [
  "emi",
  "loan-eligibility",
  "stamp-duty",
  "gst",
];

// FOOTER_COLUMNS is computed once at module load and rendered on every public
// page (via site-footer.tsx -> app/(public)/layout.tsx), so a lookup miss here
// must never throw: dropping one link is a footer bug, crashing the site is
// not. footer-links.test.ts asserts every id/slug below actually resolves.
function findLoanLink(id: string): FooterLink | null {
  const product = LOAN_PRODUCTS.find((p) => p.id === id);
  return product ? { label: product.label, href: `/loans#${id}` } : null;
}

function findCalculatorLink(slug: CalculatorSlug): FooterLink | null {
  const calculator = getCalculator(slug);
  return calculator
    ? { label: calculator.navLabel, href: `/calculators/${slug}` }
    : null;
}

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    heading: "Loans",
    links: FOOTER_LOAN_IDS.map(findLoanLink).filter((link) => link !== null),
  },
  {
    heading: "Real Estate",
    links: PROPERTY_CATEGORIES.map((category) => ({
      label: category.label,
      href: `/real-estate#${category.key}`,
    })),
  },
  {
    heading: "Company",
    links: [
      { label: "Earn with Us", href: "/earn-with-us" },
      { label: "Apply as Partner", href: "/apply-as-agent" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    heading: "Resources",
    links: [
      ...FOOTER_CALCULATOR_SLUGS.map(findCalculatorLink).filter(
        (link) => link !== null,
      ),
      { label: "All Calculators", href: "/calculators" },
    ],
  },
];
