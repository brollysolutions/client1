"use client";

import { usePathname } from "next/navigation";
import { Repeat2 } from "lucide-react";

import type { BusinessLine } from "@/lib/auth";
import { cn } from "@/lib/utils";

import { useLine } from "./line-provider";

const LABELS: Record<BusinessLine, string> = {
  loans: "Loans",
  real_estate: "Real Estate",
};

// Single swap button (not a tabs widget: it swaps a whole route, not an inline
// panel) that flips the workspace between the client's lines. Shown only for
// multi-line clients and only on the workspace home. Line accent is blue-only
// (ADR-0007), so the button shows the current line by label, not by colour.
export function LineSwitcher() {
  const { activeLine, setActiveLine, canSwitch } = useLine();
  const pathname = usePathname();
  if (!canSwitch || pathname !== "/dashboard") return null;

  const other: BusinessLine = activeLine === "loans" ? "real_estate" : "loans";

  return (
    <button
      type="button"
      aria-label={`Switch to ${LABELS[other]}`}
      title={`Switch to ${LABELS[other]}`}
      onClick={() => setActiveLine(other)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-dash-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors",
        "hover:border-brand-cta hover:bg-brand-cta-tint hover:text-brand-cta",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
      )}
    >
      <Repeat2 className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline">{LABELS[activeLine]}</span>
    </button>
  );
}
