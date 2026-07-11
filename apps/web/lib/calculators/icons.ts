import {
  BadgeCheck,
  Building2,
  Calculator,
  FileText,
  Home,
  PiggyBank,
  Receipt,
  Scale,
  TrendingDown,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import type { CalculatorSlug } from "./types";

// Per-calculator lucide icon, kept out of the registry so the registry stays
// plain serializable data usable in server metadata / JSON-LD. Rendered as a
// tinted badge on hub cards, related-calculator cards, and page headers.
export const CALCULATOR_ICONS: Record<CalculatorSlug, LucideIcon> = {
  emi: Calculator,
  "loan-eligibility": BadgeCheck,
  prepayment: TrendingDown,
  "loan-comparison": Scale,
  "loan-against-property": Building2,
  "home-affordability": Home,
  "stamp-duty": FileText,
  gst: Receipt,
  "property-appreciation": TrendingUp,
  "rental-yield": Wallet,
  "down-payment-planner": PiggyBank,
};

export function calculatorIcon(slug: CalculatorSlug): LucideIcon {
  return CALCULATOR_ICONS[slug];
}
