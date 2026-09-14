import { LoadingRegion } from "@/components/ui/loading-region";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardPage } from "./dashboard-ui";

export function DashboardPageSkeleton({ label = "Loading workspace", overview = false }: { label?: string; overview?: boolean }) {
  return (
    <DashboardPage>
      <LoadingRegion label={label} className="space-y-5 sm:space-y-6">
        <div className="space-y-3 border-b border-border pb-5">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-full max-w-xl" />
        </div>
        {overview ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="space-y-4 rounded-xl border border-border bg-surface p-5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-32" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <Skeleton className="h-11 rounded-lg" />
            <Skeleton className="h-11 rounded-lg" />
          </div>
        )}
        <div className="space-y-4 rounded-xl border border-border bg-surface p-4 sm:p-5">
          <Skeleton className="h-6 w-48" />
          {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-16 rounded-lg xl:h-12" />)}
        </div>
      </LoadingRegion>
    </DashboardPage>
  );
}

/** Neutral shell while the refresh response determines the role/navigation. */
export function AppShellSkeleton() {
  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[5rem_minmax(0,1fr)]">
      <div aria-hidden="true" className="hidden space-y-5 bg-brand-navy px-4 py-6 lg:block">
        {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-12 w-12 rounded-lg bg-white/20" />)}
      </div>
      <div className="min-w-0">
        <div aria-hidden="true" className="flex h-16 items-center justify-between border-b border-border bg-surface px-4">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-9 w-40 rounded-lg" />
        </div>
        <div className="py-5 sm:py-8"><DashboardPageSkeleton label="Loading your workspace" /></div>
      </div>
    </div>
  );
}
