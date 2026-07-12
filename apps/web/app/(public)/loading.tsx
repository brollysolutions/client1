import { Skeleton } from "@/components/ui/skeleton";

// Route-level Suspense fallback for the whole (public) group (home, loans,
// real-estate, calculators hub, earn-with-us). SiteHeader/SiteFooter persist
// via the layout; this only covers the <main> segment while it streams in, so
// it stays a generic hero + content shape rather than matching one page.
export default function PublicLoading() {
  return (
    <div aria-hidden className="w-full bg-[var(--nav-bg)]">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <Skeleton className="h-10 w-2/3 max-w-xl sm:h-12" />
        <Skeleton className="mt-4 h-5 w-full max-w-2xl" />
        <Skeleton className="mt-2 h-5 w-5/6 max-w-xl" />
        <div className="mt-8 flex flex-wrap gap-3">
          <Skeleton className="h-11 w-40 rounded-lg" />
          <Skeleton className="h-11 w-40 rounded-lg" />
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
