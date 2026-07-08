import dynamic from "next/dynamic";
import type { ComponentType } from "react";

import type { CalculatorSlug } from "./types";

// Maps each calculator to its interactive client island, code-split per route so
// a page only ships its own calculator's JS. Registered here as each island is
// built; the [slug] route degrades gracefully for any not yet listed.
export const ISLANDS: Partial<Record<CalculatorSlug, ComponentType>> = {
  emi: dynamic(() =>
    import("@/components/calculators/islands/emi-calculator").then((m) => m.EmiCalculator),
  ),
};
