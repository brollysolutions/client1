import { Badge } from "@/components/ui/badge";
import { RATE_DISCLAIMER } from "@/lib/calculators/rates";
import { cn } from "@/lib/utils";

// Sits next to any prefilled interest rate. Makes clear the seeded rate is an
// illustrative example, not an offer (no lenders are onboarded yet).
export function RateDisclaimer({ text, className }: { text?: string; className?: string }) {
  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary", className)}>
      <Badge variant="secondary" className="bg-[var(--nav-tint)] text-[var(--nav-primary)]">
        Indicative
      </Badge>
      <span>{text ?? RATE_DISCLAIMER}</span>
    </p>
  );
}
