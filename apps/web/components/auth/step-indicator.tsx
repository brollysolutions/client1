import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

type Tone = "navy" | "light" | "sky";

// Per-tone class lookups. `filled` = the current or a completed step's circle;
// the label variants cover active / done / pending. `sky` reads on the auth
// brand panel's sky-blue gradient (white circles + white labels); `navy` is the
// legacy dark-panel palette; `light` is the cream form header on small screens.
const CIRCLE: Record<Tone, { filled: string; empty: string }> = {
  navy: { filled: "bg-brand-sky text-brand-navy", empty: "border border-white/30 text-white/50" },
  sky: { filled: "bg-white text-brand-cta", empty: "border border-white/50 text-white/70" },
  light: { filled: "bg-brand-navy text-white", empty: "border border-border text-text-secondary" },
};
const LABEL: Record<Tone, { active: string; done: string; pending: string }> = {
  navy: { active: "font-semibold text-white", done: "text-white/80", pending: "text-white/45" },
  sky: { active: "font-semibold text-white", done: "text-white/85", pending: "text-white/60" },
  light: {
    active: "font-semibold text-text-primary",
    done: "text-text-secondary",
    pending: "text-text-secondary",
  },
};

// Numbered progress steps. Rendered on the sky brand panel (`tone="sky"`) and,
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
  tone?: Tone;
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
                filled ? CIRCLE[tone].filled : CIRCLE[tone].empty
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span
              className={cn(
                "text-sm",
                active ? LABEL[tone].active : done ? LABEL[tone].done : LABEL[tone].pending
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
