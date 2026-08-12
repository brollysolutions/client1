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
          <div className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
            {/* Same named container as the page, so the heading, intro, and
                link row all switch tiers on the same measurements. The heading
                skeletons reserve line-height, not font-size, at each of the
                page's tiers: 36 / 40 / 48 / 60px. */}
            <div className="@container/hero-copy">
              <Skeleton className="h-9 w-full max-w-2xl @min-[340px]/hero-copy:h-10 @min-[440px]/hero-copy:h-12 @min-[700px]/hero-copy:h-15" />
              <Skeleton className="mt-3 h-9 w-3/4 max-w-xl @min-[340px]/hero-copy:h-10 @min-[440px]/hero-copy:h-12 @min-[700px]/hero-copy:h-15" />
              <Skeleton className="mt-5 h-5 w-full max-w-2xl" />
              <Skeleton className="mt-2 h-5 w-5/6 max-w-xl" />
              {/* Category jump-link row, one line at every width like the page.
                  flex-1 under a max-width cap gets there without restating the
                  page's tiers: the cells share the row when it is narrow and
                  stop at pill size once there is room, so they can never wrap
                  into a second line and shift the hero on hydration. */}
              <div className="mt-8 flex gap-1.5 @min-[340px]/hero-copy:gap-2 @min-[470px]/hero-copy:gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    className="h-[38px] min-w-0 flex-1 rounded-lg @min-[400px]/hero-copy:h-[45px] @min-[400px]/hero-copy:max-w-[124px]"
                  />
                ))}
              </div>
            </div>
            {/* Tracks CalculatorHeroArt's width ladder exactly; hub.svg is 1:1,
                so aspect-square reserves the real footprint at every step. */}
            <div className="flex w-full items-center justify-center md:w-[260px] lg:w-[460px]">
              <Skeleton className="aspect-square w-full max-w-[220px] rounded-2xl sm:max-w-[300px] md:max-w-none" />
            </div>
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
