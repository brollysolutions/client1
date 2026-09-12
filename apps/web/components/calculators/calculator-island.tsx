"use client";

import React from "react";

import { ISLANDS } from "@/lib/calculators/islands";
import type { CalculatorSlug } from "@/lib/calculators/types";

// The dynamic imports must be below a client boundary. Importing their map
// directly from the Server Component bundles every calculator into each route
// in Next 15. Keep the existing static shell and URL-driven input behavior.
export function CalculatorIsland({ slug }: { slug: CalculatorSlug }) {
  const Island = ISLANDS[slug];
  return Island ? (
    <Island />
  ) : (
    <p className="rounded-xl border border-[var(--nav-border)] bg-white p-6 text-text-secondary">
      This calculator is being finalized. In the meantime, leave your number below and our
      team will help you directly.
    </p>
  );
}
