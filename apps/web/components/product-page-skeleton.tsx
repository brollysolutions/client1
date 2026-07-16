import { Skeleton } from "@/components/ui/skeleton";

// Loading fallback shaped like components/product-page.tsx (the shared /loans
// and /real-estate layout): a two-column hero (copy + illustration slot on lg+)
// over a services card grid. SiteHeader/SiteFooter persist via the layout, so
// this only stands in for the streaming <main>.
export function ProductPageSkeleton() {
  return (
    <div aria-hidden className="w-full bg-[var(--nav-bg)]">
      {/* Hero: copy column + lg-only illustration slot */}
      <section className="w-full">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div>
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-4 h-12 w-full max-w-2xl sm:h-14" />
              <Skeleton className="mt-3 h-12 w-4/5 max-w-xl sm:h-14" />
              <Skeleton className="mt-6 h-5 w-full max-w-2xl" />
              <Skeleton className="mt-2 h-5 w-3/4 max-w-xl" />
            </div>
            <Skeleton className="hidden h-[300px] w-[420px] rounded-2xl lg:block" />
          </div>
        </div>
      </section>

      {/* Services card grid */}
      <section className="w-full border-t border-[var(--nav-border)]">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <Skeleton className="mx-auto h-9 w-64 max-w-full" />
          <Skeleton className="mx-auto mt-3 h-5 w-96 max-w-full" />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-56 w-full rounded-2xl" />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
