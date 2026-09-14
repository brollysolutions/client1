import { LoadingRegion } from "@/components/ui/loading-region";
import { Skeleton } from "@/components/ui/skeleton";

export function InvitationSkeleton() {
  return (
    <LoadingRegion label="Checking invitation" className="mx-auto flex min-h-[55vh] max-w-2xl items-center px-4 py-16 sm:px-6">
      <div className="w-full space-y-5 rounded-3xl border border-border bg-surface p-8 sm:p-12">
        <Skeleton className="mx-auto h-14 w-14 rounded-2xl" />
        <Skeleton className="mx-auto h-9 w-3/4" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="mx-auto h-5 w-4/5" />
        <Skeleton className="mx-auto h-11 w-44 rounded-lg" />
      </div>
    </LoadingRegion>
  );
}
