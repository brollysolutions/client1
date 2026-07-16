import { Skeleton } from "@/components/ui/skeleton";

// Mirrors /earn-with-us (hero + earning tracks). Two-column hero with two CTAs
// and an illustration slot on lg+, then a card row and a two-track row.
export default function EarnWithUsLoading() {
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
              <Skeleton className="mt-2 h-5 w-4/5 max-w-xl" />
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Skeleton className="h-10 w-full rounded-md sm:w-44" />
                <Skeleton className="h-10 w-full rounded-md sm:w-36" />
              </div>
            </div>
            <Skeleton className="hidden h-[320px] w-[440px] rounded-2xl lg:block" />
          </div>
        </div>
      </section>

      {/* Eligibility-style card row */}
      <section className="w-full border-t border-[var(--nav-border)]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <Skeleton className="mx-auto h-9 w-72 max-w-full" />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-52 w-full rounded-2xl" />
            ))}
          </div>
        </div>
      </section>

      {/* Two earning tracks */}
      <section className="w-full border-t border-[var(--nav-border)]">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="grid gap-6 sm:grid-cols-2">
            <Skeleton className="h-48 w-full rounded-2xl" />
            <Skeleton className="h-48 w-full rounded-2xl" />
          </div>
        </div>
      </section>
    </div>
  );
}
