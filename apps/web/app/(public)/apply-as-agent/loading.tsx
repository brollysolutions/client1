import { Skeleton } from "@/components/ui/skeleton";

// Route-level skeleton for /apply-as-agent, shaped like the real page (two-
// column hero with an illustration slot on md+ + centered max-w-3xl form with
// square KYC upload tiles) so the swap to content doesn't jump. Overrides the
// generic (public) group loading fallback. SiteHeader/SiteFooter persist via
// the (public) layout.
export default function ApplyAsAgentLoading() {
  return (
    <div aria-hidden>
      {/* Hero: two-line heading + description left, illustration slot right
          (md+), stacking under the copy below md */}
      <section className="w-full bg-[var(--nav-bg)]">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
            <div>
              <Skeleton className="h-10 w-40 sm:h-12 sm:w-56" />
              <Skeleton className="mt-2 h-10 w-28 sm:h-12 sm:w-36" />
              <Skeleton className="mt-5 h-5 w-full max-w-2xl" />
              <Skeleton className="mt-2 h-5 w-5/6 max-w-xl" />
            </div>
            {/* Square, not fixed-height: the hero art is a 1:1 500x500 asset
                shown at every breakpoint, so the placeholder tracks the same
                width ladder to keep the swap shift-free. */}
            <div className="flex w-full items-center justify-center md:w-[260px] lg:w-[460px]">
              <Skeleton className="aspect-square w-full max-w-[220px] rounded-2xl sm:max-w-[300px] md:max-w-none" />
            </div>
          </div>
        </div>
      </section>

      {/* Application form: centered max-w-3xl column, centered section header */}
      <section className="w-full border-t border-[var(--nav-border)] bg-[var(--nav-bg)]">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <div className="flex flex-col items-center">
              <Skeleton className="h-8 w-1/2 max-w-xs" />
              <Skeleton className="mt-2 h-5 w-3/4 max-w-sm" />
            </div>

            <div className="mt-8 grid gap-8">
              {/* progress bar */}
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>

              {/* business line */}
              <div className="grid gap-4">
                <div className="grid gap-1.5">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-72 max-w-full" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Skeleton className="h-12 rounded-lg" />
                  <Skeleton className="h-12 rounded-lg" />
                </div>
              </div>

              {/* your details */}
              <div className="grid gap-4 border-t border-[var(--nav-border)] pt-8">
                <Skeleton className="h-5 w-28" />
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-12 rounded-lg" />
                  </div>
                  <div className="grid gap-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-12 rounded-lg" />
                  </div>
                </div>
              </div>

              {/* contact */}
              <div className="grid gap-4 border-t border-[var(--nav-border)] pt-8">
                <Skeleton className="h-5 w-20" />
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-12 rounded-lg" />
                  </div>
                  <div className="grid gap-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-12 rounded-lg" />
                  </div>
                </div>
              </div>

              {/* KYC documents: tinted container + 4 square upload tiles
                  (grid-cols-2, lg 4-across), matching the real tile grid */}
              <div className="border-t border-[var(--nav-border)] pt-8">
                <div className="rounded-xl border border-[var(--nav-border)] bg-[var(--nav-tint)]/30 p-5 sm:p-6">
                  <div className="grid gap-1.5">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
                      <Skeleton className="h-5 w-36" />
                    </div>
                    <Skeleton className="h-4 w-56 max-w-full" />
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="grid content-start gap-2">
                        <Skeleton className="h-4 w-20 justify-self-center" />
                        <Skeleton className="aspect-square w-full rounded-xl" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <Skeleton className="h-12 w-full rounded-md" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
