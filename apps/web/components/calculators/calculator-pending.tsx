import { Skeleton } from "@/components/ui/skeleton";

// URL-driven controls hydrate on the client. Reserve their initial viewport
// space so the FAQ does not paint here and then jump below the calculator.
export function CalculatorPending() {
  return (
    <div role="status" className="min-h-[32rem] lg:min-h-[24rem]">
      <span className="sr-only">Loading calculator…</span>
      <div aria-hidden className="grid gap-8 lg:grid-cols-2">
        <div className="grid content-start gap-6">
          <Skeleton className="h-16 w-full animate-none rounded-lg" />
          <Skeleton className="h-16 w-full animate-none rounded-lg" />
          <Skeleton className="h-16 w-full animate-none rounded-lg" />
        </div>
        <div className="grid content-start gap-4 sm:grid-cols-2">
          <Skeleton className="h-24 w-full animate-none rounded-xl" />
          <Skeleton className="h-24 w-full animate-none rounded-xl" />
          <Skeleton className="h-24 w-full animate-none rounded-xl sm:col-span-2" />
        </div>
      </div>
    </div>
  );
}
