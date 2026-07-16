import { Loader2 } from "lucide-react";

// Route-level Suspense fallback for the (app) group. Matches the AppGuard
// spinner so entering the dashboard shows one continuous pending state
// (segment streaming -> auth hydration) rather than a blank frame first.
export default function AppLoading() {
  return (
    <div aria-hidden className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-brand-navy" />
    </div>
  );
}
