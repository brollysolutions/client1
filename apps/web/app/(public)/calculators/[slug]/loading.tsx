import { Skeleton } from "@/components/ui/skeleton";

// Mirrors calculator-shell.tsx's hero + island shape (the heaviest public
// routes: breadcrumb, h1/intro, hero art, then the two-column input/result
// grid every calculator island uses).
export default function CalculatorLoading() {
  return (
    <div aria-hidden>
      <div className="w-full bg-[var(--nav-bg)]">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <Skeleton className="h-4 w-56" />
          <div className="mt-6 grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div>
              <Skeleton className="h-10 w-2/3 max-w-md sm:h-11" />
              <Skeleton className="mt-4 h-5 w-full max-w-2xl" />
              <Skeleton className="mt-2 h-5 w-5/6 max-w-xl" />
            </div>
            <Skeleton className="hidden h-48 w-48 shrink-0 rounded-xl lg:block" />
          </div>
        </div>
      </div>
      <div className="w-full border-t border-[var(--nav-border)] bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="grid content-start gap-6">
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
            <div className="grid content-start gap-4 sm:grid-cols-2">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl sm:col-span-2" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
