import { Skeleton } from "@/components/ui/skeleton";
import { LoadingRegion } from "@/components/ui/loading-region";
import { DashboardPage } from "@/features/dashboard/dashboard-ui";

export function RealEstateHomeSkeleton() {
  return <DashboardPage><LoadingRegion label="Loading Real Estate home" className="space-y-7"><div className="space-y-4"><Skeleton className="h-9 w-64 max-w-full" /><Skeleton className="h-5 w-96 max-w-full" /><Skeleton className="h-14 w-full rounded-xl" /></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div><Skeleton className="h-7 w-44" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-56 rounded-xl" />)}</div></LoadingRegion></DashboardPage>;
}
