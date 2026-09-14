import { LoadingRegion } from "@/components/ui/loading-region";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function LegalPageSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <LoadingRegion label="Loading document" className="bg-surface-sky px-4 py-10 sm:px-6 sm:py-14">
      <div className={cn("mx-auto space-y-8 rounded-2xl border border-border bg-surface px-5 py-10 sm:px-10 sm:py-12", wide ? "max-w-5xl" : "max-w-3xl")}>
        <Skeleton className="h-10 w-2/3" />
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-3">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}
