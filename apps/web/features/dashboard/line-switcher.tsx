"use client";

import { Repeat2 } from "lucide-react";

import type { BusinessLine } from "@/lib/auth";
import { cn } from "@/lib/utils";

import { useLine } from "./line-provider";

const LABELS: Record<BusinessLine, string> = {
  loans: "Loans",
  real_estate: "Real Estate",
};

// Single swap button (not a tabs widget: it swaps a whole route, not an inline
// panel) that flips the workspace between the client's lines. Shown on every
// dashboard page for multi-line clients. Line accent is blue-only (ADR-0007),
// so the button shows the current line by label, not by colour.
export function LineSwitcher() {
  const { activeLine, setActiveLine, canSwitch } = useLine();
  if (!canSwitch) return null;

  const other: BusinessLine = activeLine === "loans" ? "real_estate" : "loans";

  return (
    <button
      type="button"
      aria-label={`Switch to ${LABELS[other]}`}
      title={`Switch to ${LABELS[other]}`}
      onClick={() => setActiveLine(other)}
      className={cn(
        "group inline-flex cursor-pointer items-center gap-2 rounded-full border border-dash-border bg-surface py-1.5 pl-3 pr-3.5 text-sm font-medium text-text-secondary shadow-sm",
        "transition-all duration-200 ease-out",
        "hover:border-brand-cta hover:bg-brand-cta-tint hover:text-brand-cta hover:shadow-md",
        "active:scale-[0.97]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-1 focus-visible:ring-offset-background",
      )}
    >
      <Repeat2
        className="h-4 w-4 shrink-0 transition-transform duration-300 ease-out group-hover:rotate-180"
        aria-hidden="true"
      />
      {/* Two collapsing tracks: the resting label sits in a 1fr track, the hover
          label in a 0fr track. On hover the fr weights swap, so the pill width
          animates to fit whichever label shows (no dead space when the label is
          short, e.g. "Loans"). min-w-0 lets the collapsed track contribute 0. */}
      <span
        className={cn(
          "hidden grid-flow-col transition-[grid-template-columns] duration-300 ease-out sm:grid",
          "[grid-template-columns:1fr_0fr] group-hover:[grid-template-columns:0fr_1fr]",
        )}
      >
        <span className="min-w-0 overflow-hidden whitespace-nowrap opacity-100 transition-opacity duration-200 group-hover:opacity-0">
          {LABELS[activeLine]}
        </span>
        <span className="min-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          Switch to {LABELS[other]}
        </span>
      </span>
    </button>
  );
}
