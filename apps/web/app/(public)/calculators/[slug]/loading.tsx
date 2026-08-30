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
          <div className="mt-6 grid items-center gap-8 md:grid-cols-[1fr_auto]">
            {/* Same named container as calculator-shell, so the heading
                skeleton steps on the same measurements. Reserves line-height at
                each tier: 36 / 40 / 48px (the shell caps at text-5xl). */}
            <div className="@container/hero-copy">
              <Skeleton className="h-9 w-2/3 max-w-md @min-[340px]/hero-copy:h-10 @min-[440px]/hero-copy:h-12" />
              <Skeleton className="mt-4 h-5 w-full max-w-2xl" />
              <Skeleton className="mt-2 h-5 w-5/6 max-w-xl" />
            </div>
            {/* Tracks CalculatorHeroArt's width ladder. loading.tsx gets no route
                params, so there's one shared ratio: aspect-square is exact for
                17 of the 18 assets, and over-reserves for the 3:2 emi.svg. */}
            <div className="flex w-full items-center justify-center md:w-[260px] lg:w-[460px]">
              <Skeleton className="aspect-square w-full max-w-[220px] rounded-2xl sm:max-w-[300px] md:max-w-none" />
            </div>
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
