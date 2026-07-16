import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the calculators hub (app/(public)/calculators/page.tsx): a two-column
// hero with the category jump-link row, then grouped calculator-card grids.
// Note: /calculators/[slug] has its own faithful loading.tsx; this covers the
// hub index only.
export default function CalculatorsHubLoading() {
  return (
    <div aria-hidden className="w-full bg-[var(--nav-bg)]">
      {/* Hero */}
      <section className="w-full">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div>
              <Skeleton className="h-12 w-full max-w-2xl sm:h-14" />
              <Skeleton className="mt-3 h-12 w-3/4 max-w-xl sm:h-14" />
              <Skeleton className="mt-5 h-5 w-full max-w-2xl" />
              <Skeleton className="mt-2 h-5 w-5/6 max-w-xl" />
              {/* Category jump-link row */}
              <div className="mt-8 flex flex-wrap gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-44 rounded-lg" />
                ))}
              </div>
            </div>
            <Skeleton className="hidden h-[280px] w-[380px] rounded-2xl lg:block" />
          </div>
        </div>
      </section>

      {/* Two grouped calculator sections */}
      {Array.from({ length: 2 }).map((_, s) => (
        <section key={s} className="w-full border-t border-[var(--nav-border)]">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <Skeleton className="h-8 w-56 max-w-full" />
            <Skeleton className="mt-3 h-5 w-full max-w-3xl" />
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-40 w-full rounded-2xl" />
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
