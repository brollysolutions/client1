import { Skeleton } from "@/components/ui/skeleton";
import { LoadingRegion } from "@/components/ui/loading-region";
import { CalculatorPending } from "@/components/calculators/calculator-pending";

// Mirrors calculator-shell.tsx's hero + island shape (the heaviest public
// routes: breadcrumb, h1/intro, hero art, then the two-column input/result
// grid every calculator island uses).
export default function CalculatorLoading() {
  return (
    <LoadingRegion label="Loading calculator page">
      <div className="w-full bg-brand-cta-tint">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <Skeleton className="h-4 w-56" />
          <div className="mt-6 grid items-center gap-8 lg:min-h-[460px] lg:grid-cols-[1fr_auto]">
            <div>
              <Skeleton className="h-10 w-2/3 max-w-md sm:h-11" />
              <Skeleton className="mt-4 h-5 w-full max-w-2xl" />
              <Skeleton className="mt-2 h-5 w-5/6 max-w-xl" />
            </div>
            <Skeleton className="hidden h-[460px] w-[460px] shrink-0 rounded-xl lg:block" />
          </div>
        </div>
      </div>
      <div className="w-full border-t border-[var(--nav-border)] bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <div aria-hidden="true"><CalculatorPending /></div>
        </div>
      </div>
    </LoadingRegion>
  );
}
