import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

// Placeholder for a surface whose real content lands in a later phase. Neutral by
// default; a page can tint the icon by passing accent classes. The line accent is
// blue-only for both lines (ADR-0007), so callers pass the soft-blue tokens
// (bg-loans-soft text-loans-accent), never a per-line green/amber.
export function ComingSoon({
  icon: Icon,
  title,
  description,
  accentClassName,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  accentClassName?: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
      <span
        className={cn(
          "mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-text-secondary",
          accentClassName,
        )}
      >
        <Icon className="h-6 w-6" />
      </span>
      <h2 className="mt-5 text-lg font-semibold text-text-primary">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">{description}</p>
      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-text-secondary">
        Coming soon
      </p>
    </div>
  );
}
