import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

// Numbered progress steps. Rendered on the navy brand panel (`tone="navy"`) and,
// on small screens where that panel is hidden, in the cream form header
// (`tone="light"`). `activeStep` is a 0-based index; earlier steps render done.
export function StepIndicator({
  steps,
  activeStep,
  tone = "navy",
  className,
}: {
  steps: string[];
  activeStep: number;
  tone?: "navy" | "light";
  className?: string;
}) {
  return (
    <ol className={cn("flex flex-wrap items-center gap-x-5 gap-y-2", className)}>
      {steps.map((label, i) => {
        const done = i < activeStep;
        const active = i === activeStep;
        const filled = done || active;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                tone === "navy"
                  ? filled
                    ? "bg-brand-sky text-brand-navy"
                    : "border border-white/30 text-white/50"
                  : filled
                    ? "bg-brand-navy text-white"
                    : "border border-border text-text-secondary"
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span
              className={cn(
                "text-sm",
                tone === "navy"
                  ? active
                    ? "font-semibold text-white"
                    : done
                      ? "text-white/80"
                      : "text-white/45"
                  : active
                    ? "font-semibold text-text-primary"
                    : "text-text-secondary"
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
