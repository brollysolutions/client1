import Link from "next/link";
import { ArrowRight } from "lucide-react";
import React from "react";

import { calculatorIcon } from "@/lib/calculators/icons";
import type { CalculatorDef } from "@/lib/calculators/types";
import { cn } from "@/lib/utils";

// Shared calculator link card: a plain Lucide icon, label and summary.
// Used by the hub grid and the related-calculators grid so the two never drift.
// `compact` trims padding and hides the footer link for the denser related grid.
export function CalculatorCard({
  def,
  compact = false,
}: {
  def: CalculatorDef;
  compact?: boolean;
}) {
  const Icon = calculatorIcon(def.slug);

  return (
    <Link
      href={`/calculators/${def.slug}`}
      className={cn(
        "group flex h-full flex-col rounded-2xl border border-[var(--nav-border)] bg-card transition-[border-color,box-shadow] duration-150 hover:border-brand-cta hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none",
        compact ? "p-5" : "p-6",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex items-center justify-center text-brand-link",
          compact ? "h-10 w-10" : "h-12 w-12",
        )}
      >
        <Icon className={compact ? "h-5 w-5" : "h-6 w-6"} />
      </span>
      <h3
        className={cn(
          "mt-4 font-heading font-semibold text-[var(--nav-text)] transition-colors group-hover:text-brand-link",
          compact ? "text-base" : "text-lg",
        )}
      >
        {def.navLabel}
      </h3>
      <p className="mt-2 flex-1 text-sm text-text-secondary">{def.cardSummary}</p>
      {!compact ? (
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-link">
          Open calculator
          <ArrowRight
            className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
            aria-hidden
          />
        </span>
      ) : null}
    </Link>
  );
}
