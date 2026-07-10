import dynamic from "next/dynamic";
import type { ComponentType } from "react";

import type { CalculatorSlug } from "./types";

// Maps each calculator to its interactive client island, code-split per route so
// a page only ships its own calculator's JS.
export const ISLANDS: Partial<Record<CalculatorSlug, ComponentType>> = {
  emi: dynamic(() =>
    import("@/components/calculators/islands/emi-calculator").then((m) => m.EmiCalculator),
  ),
  "loan-eligibility": dynamic(() =>
    import("@/components/calculators/islands/loan-eligibility-calculator").then(
      (m) => m.LoanEligibilityCalculator,
    ),
  ),
  prepayment: dynamic(() =>
    import("@/components/calculators/islands/prepayment-calculator").then(
      (m) => m.PrepaymentCalculator,
    ),
  ),
  "loan-comparison": dynamic(() =>
    import("@/components/calculators/islands/loan-comparison-calculator").then(
      (m) => m.LoanComparisonCalculator,
    ),
  ),
  "loan-against-property": dynamic(() =>
    import("@/components/calculators/islands/loan-against-property-calculator").then(
      (m) => m.LoanAgainstPropertyCalculator,
    ),
  ),
  "home-affordability": dynamic(() =>
    import("@/components/calculators/islands/home-affordability-calculator").then(
      (m) => m.HomeAffordabilityCalculator,
    ),
  ),
  "stamp-duty": dynamic(() =>
    import("@/components/calculators/islands/stamp-duty-calculator").then(
      (m) => m.StampDutyCalculator,
    ),
  ),
  gst: dynamic(() =>
    import("@/components/calculators/islands/gst-calculator").then((m) => m.GstCalculator),
  ),
  "property-appreciation": dynamic(() =>
    import("@/components/calculators/islands/property-appreciation-calculator").then(
      (m) => m.PropertyAppreciationCalculator,
    ),
  ),
  "rental-yield": dynamic(() =>
    import("@/components/calculators/islands/rental-yield-calculator").then(
      (m) => m.RentalYieldCalculator,
    ),
  ),
  "down-payment-planner": dynamic(() =>
    import("@/components/calculators/islands/down-payment-planner-calculator").then(
      (m) => m.DownPaymentPlannerCalculator,
    ),
  ),
};
