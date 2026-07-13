import { Skeleton } from "@/components/ui/skeleton";

// Route-level skeleton for /contact, shaped like the real page (two-column hero
// with an illustration slot on lg+, flat card-less form beside flat icon rows)
// so the swap to content doesn't jump. Overrides the generic (public) group
// loading fallback. SiteHeader/SiteFooter persist via the (public) layout.
export default function ContactLoading() {
  return (
    <div aria-hidden>
      {/* Hero: copy left, illustration slot right (lg+ only) */}
      <section className="w-full bg-[var(--nav-bg)]">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div>
              <Skeleton className="h-10 w-1/2 max-w-sm sm:h-12" />
              <Skeleton className="mt-5 h-5 w-full max-w-2xl" />
              <Skeleton className="mt-2 h-5 w-5/6 max-w-xl" />
            </div>
            <div className="hidden shrink-0 items-center justify-center lg:flex lg:w-[420px]">
              <Skeleton className="h-[340px] w-full max-w-[420px] rounded-2xl" />
            </div>
          </div>
        </div>
      </section>

      {/* Form + contact details: both columns flat on the cream band */}
      <section className="w-full border-t border-[var(--nav-border)] bg-[var(--nav-bg)]">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
            {/* message form (no card) */}
            <div>
              <Skeleton className="h-8 w-1/2 max-w-xs" />
              <Skeleton className="mt-2 h-5 w-3/4 max-w-sm" />
              <div className="mt-8 grid gap-5">
                <div className="grid gap-2">
                  <Skeleton className="h-4 w-32" />
                  <div className="grid grid-cols-3 gap-2">
                    <Skeleton className="h-12 rounded-lg" />
                    <Skeleton className="h-12 rounded-lg" />
                    <Skeleton className="h-12 rounded-lg" />
                  </div>
                </div>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="grid gap-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-12 w-full rounded-lg" />
                  </div>
                ))}
                <div className="grid gap-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-24 w-full rounded-lg" />
                </div>
                <Skeleton className="h-12 w-full rounded-md" />
              </div>
            </div>

            {/* contact details: flat icon rows, single column */}
            <div className="lg:pt-1">
              <Skeleton className="h-8 w-2/3 max-w-xs" />
              <Skeleton className="mt-2 h-5 w-full max-w-sm" />
              <div className="mt-8 grid gap-7">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-4">
                    <Skeleton className="h-11 w-11 shrink-0 rounded-lg" />
                    <div className="w-full">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="mt-2 h-4 w-40" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
