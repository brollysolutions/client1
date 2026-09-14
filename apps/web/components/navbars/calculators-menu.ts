import { calculatorIcon } from "@/lib/calculators/icons";
import type { CalculatorSlug } from "@/lib/calculators/types";
import type { NavColumn, NavGroup } from "./nav-items";

// Keep the shared client header small: calculator explanations, FAQs and SEO
// copy stay in the server registry. The menu integrity test checks these labels
// and groups against that registry, including any newly added calculator.
const LABELS: Record<CalculatorSlug, string> = {
  emi: "EMI Calculator",
  "loan-eligibility": "Loan Eligibility",
  prepayment: "Prepayment",
  "loan-comparison": "Loan Comparison",
  "loan-against-property": "Loan Against Property",
  "balance-transfer": "Balance Transfer",
  "flat-vs-reducing": "Flat vs Reducing Rate",
  "home-affordability": "Home Affordability",
  "stamp-duty": "Stamp Duty",
  gst: "GST on Property",
  "property-appreciation": "Property Appreciation",
  "rental-yield": "Rental Yield",
  "down-payment-planner": "Down Payment Planner",
  "rent-vs-buy": "Rent vs Buy",
  "credit-card-payoff": "Card Payoff",
  "credit-card-emi": "Card EMI",
  "term-insurance": "Term Insurance Cover",
  "health-insurance": "Health Insurance Cover",
};

function group(key: string, heading: string, slugs: CalculatorSlug[]): NavGroup {
  return {
    key: `calculator-${key}`,
    heading,
    items: slugs.map((slug) => ({
      label: LABELS[slug], href: `/calculators/${slug}`, icon: calculatorIcon(slug),
    })),
  };
}

export const CALCULATORS_MENU: NavColumn[] = [
  { groups: [group("loans", "Loans", ["emi", "loan-eligibility", "prepayment", "loan-comparison", "loan-against-property", "balance-transfer", "flat-vs-reducing"])] },
  { groups: [group("real_estate", "Property", ["home-affordability", "stamp-duty", "gst", "property-appreciation", "rental-yield", "down-payment-planner", "rent-vs-buy"])] },
  { groups: [
    group("credit_cards", "Credit Cards", ["credit-card-payoff", "credit-card-emi"]),
    group("insurance", "Insurance", ["term-insurance", "health-insurance"]),
  ] },
];

export const CALCULATORS_OVERVIEW = {
  label: "View all calculators", href: "/calculators",
} as const;
