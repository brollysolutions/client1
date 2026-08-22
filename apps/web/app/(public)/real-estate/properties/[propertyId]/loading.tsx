import { Skeleton } from "@/components/ui/skeleton";

export default function PropertyDetailLoading() {
  return (
    <div className="min-h-screen bg-[var(--nav-bg)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <Skeleton className="h-10 w-44" />
        <Skeleton className="aspect-[16/10] w-full rounded-2xl sm:aspect-[2/1] lg:rounded-3xl" />
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
          <Skeleton className="hidden h-64 rounded-2xl lg:block" />
        </div>
      </div>
    </div>
  );
}
