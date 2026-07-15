import {
  ArrowLeftRight,
  BadgeCheck,
  Building2,
  Calculator,
  CreditCard,
  FileText,
  HeartPulse,
  Home,
  Percent,
  PiggyBank,
  Receipt,
  Scale,
  TrendingDown,
  TrendingUp,
  Umbrella,
  Wallet,
  WalletCards,
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
  "balance-transfer": ArrowLeftRight,
  "flat-vs-reducing": Percent,
  "home-affordability": Home,
  "stamp-duty": FileText,
  gst: Receipt,
  "property-appreciation": TrendingUp,
  "rental-yield": Wallet,
  "down-payment-planner": PiggyBank,
  "rent-vs-buy": Scale,
  "credit-card-payoff": CreditCard,
  "credit-card-emi": WalletCards,
  "term-insurance": Umbrella,
  "health-insurance": HeartPulse,
};

export function calculatorIcon(slug: CalculatorSlug): LucideIcon {
  return CALCULATOR_ICONS[slug];
}
