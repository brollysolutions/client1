"use client";

import { Progress } from "@/components/ui/progress";

// Sticky completion meter for the application form. Sits just under the
// public SiteHeader (sticky top-0 z-40 h-16), so top-16 seats it flush
// beneath the nav without a gap or overlap.
export function FormProgress({ value }: { value: number }) {
  return (
    <div className="sticky top-16 z-30 bg-[var(--nav-bg)] py-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-heading text-sm font-semibold text-foreground">
          Your application
        </span>
        <span
          aria-live="polite"
          className="text-sm font-medium tabular-nums text-[var(--nav-primary)]"
        >
          {value}% complete
        </span>
      </div>
      <Progress
        value={value}
        aria-label="Application completion"
        className="mt-2 bg-[var(--nav-tint)]"
        indicatorClassName="bg-[var(--nav-primary)]"
      />
    </div>
  );
}
