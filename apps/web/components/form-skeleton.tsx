import { LoadingRegion } from "@/components/ui/loading-region";
import { Skeleton } from "@/components/ui/skeleton";

export function FormSkeleton({ fields = 3, label = "Loading form" }: { fields?: number; label?: string }) {
  return (
    <LoadingRegion label={label} className="w-full space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-5 w-full" />
      </div>
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      ))}
      <Skeleton className="h-11 w-full rounded-lg" />
    </LoadingRegion>
  );
}
