import { Info } from "lucide-react";

import { RATE_DISCLAIMER, RATES_LAST_REVIEWED } from "@/lib/calculators/rates";
import { cn } from "@/lib/utils";

// Sits next to any prefilled interest rate. Makes clear the seeded rate is an
// illustrative example, not an offer (no lenders are onboarded yet), and
// surfaces when the underlying rates were last checked against source.
export function RateDisclaimer({ text, className }: { text?: string; className?: string }) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg bg-[var(--nav-tint)] px-4 py-3",
        className,
      )}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--nav-primary)]" aria-hidden />
      <div className="grid gap-1 text-sm text-[var(--nav-text)]">
        <p>
          <span className="font-semibold text-[var(--nav-primary)]">Indicative. </span>
          {text ?? RATE_DISCLAIMER}
        </p>
        <p className="text-xs text-text-secondary">Rates last reviewed {RATES_LAST_REVIEWED}.</p>
      </div>
    </div>
  );
}
