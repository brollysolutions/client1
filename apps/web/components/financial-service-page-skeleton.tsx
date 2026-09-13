import { LoadingRegion } from "@/components/ui/loading-region";
import { Skeleton } from "@/components/ui/skeleton";

export function FinancialServicePageSkeleton() {
  return (
    <LoadingRegion label="Loading financial service" className="bg-[var(--nav-bg)]">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <Skeleton className="h-5 w-40" />
        <div className="mt-8 grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="space-y-5">
            <Skeleton className="h-14 w-full max-w-xl" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-20 w-full max-w-2xl" />
            <Skeleton className="h-12 w-52 rounded-lg" />
          </div>
          <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
        </div>
      </div>
      <div className="border-t border-border bg-surface px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <Skeleton className="h-9 w-64" />
          <div className="grid gap-5 md:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-40 rounded-xl" />)}
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-14 sm:px-6 lg:px-8">
        <Skeleton className="h-9 w-full max-w-lg" />
        <Skeleton className="h-6 w-full max-w-3xl" />
        <div className="grid gap-4 rounded-2xl border border-border bg-surface p-5 lg:grid-cols-[minmax(0,1fr)_14rem_14rem_auto]">
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
          <Skeleton className="h-11 w-32" />
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-72 rounded-xl" />)}
        </div>
      </div>
    </LoadingRegion>
  );
}
