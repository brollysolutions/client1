import { Skeleton } from "@/components/ui/skeleton";

// Route-level Suspense fallback for the (auth) group (login, register,
// forgot-password). Paints a centered form-shaped skeleton while the page
// segment streams/hydrates, instead of a blank frame.
export default function AuthLoading() {
  return (
    <div aria-hidden className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="mt-3 h-5 w-full" />
        <div className="mt-8 space-y-4">
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
