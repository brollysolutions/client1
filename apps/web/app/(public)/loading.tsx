import { Skeleton } from "@/components/ui/skeleton";

// Route-level Suspense fallback for the (public) group. It is the group index's
// fallback, so it is shaped like the HOME page (app/(public)/page.tsx):
// hero carousel banner -> a line-split band -> a three-up section. The other
// group routes (loans, real-estate, calculators hub, earn-with-us) each ship
// their own faithful loading.tsx, so this only stands in for home.
// SiteHeader/SiteFooter persist via the layout; this covers the streaming
// <main> only.
export default function PublicLoading() {
  return (
    <div aria-hidden className="w-full bg-[var(--nav-bg)]">
      {/* Hero carousel: a centered coverflow banner + dot indicators */}
      <section className="w-full pb-16 sm:pb-20 lg:pb-24">
        <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-0">
          <Skeleton className="aspect-[9/5] w-full rounded-2xl" />
        </div>
        <div className="mt-6 flex items-center justify-center gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-2 w-2 rounded-full" />
          ))}
        </div>
      </section>

      {/* Line-split band: illustration + copy with check bullets */}
      <section className="w-full">
        <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8 lg:pb-24">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <Skeleton className="mx-auto hidden h-[360px] w-full max-w-[520px] rounded-2xl lg:block" />
            <div>
              <Skeleton className="h-10 w-4/5 max-w-md sm:h-12" />
              <Skeleton className="mt-4 h-5 w-full max-w-lg" />
              <Skeleton className="mt-2 h-5 w-5/6 max-w-lg" />
              <div className="mt-7 space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-11/12 max-w-md" />
                ))}
              </div>
              <Skeleton className="mt-6 h-10 w-40 rounded-md" />
            </div>
          </div>
        </div>
      </section>

      {/* Three-up section (how it works / why choose us) */}
      <section className="w-full border-t border-[var(--nav-border)]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <Skeleton className="mx-auto h-9 w-64 max-w-full" />
          <Skeleton className="mx-auto mt-3 h-5 w-80 max-w-full" />
          <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-44 w-full rounded-2xl" />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
