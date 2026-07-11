"use client";

import { useEffect } from "react";

// Segment-level error boundary. Rendered INSIDE RootLayout, so `globals.css` and
// the Tailwind v4 @theme design tokens are available — use token utilities here.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface for observability; swap for the app logger once wired.
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <h1 className="font-heading text-2xl font-semibold text-text-primary">
          Something went wrong
        </h1>
        <p className="mt-2 text-text-secondary">
          An unexpected error occurred. Please try again.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-cta px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-cta-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta"
        >
          Try again
        </button>
        {error.digest ? (
          <p className="mt-6 text-xs text-text-secondary">
            Error reference: {error.digest}
          </p>
        ) : null}
      </div>
    </main>
  );
}
