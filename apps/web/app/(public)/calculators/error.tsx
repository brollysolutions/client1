"use client";

import { useEffect } from "react";

// Route-level error boundary for the /calculators subtree. The islands are
// code-split with next/dynamic, so a transient Turbopack dev chunk desync (or a
// deploy that rotated hashed chunks mid-session) surfaces as a ChunkLoadError
// when React tries to fetch a stale chunk. reset() alone re-renders against the
// same stale graph and loops; a one-time hard reload re-fetches fresh chunks and
// almost always clears it. Non-chunk errors fall back to a manual retry.
function isChunkLoadError(error: Error): boolean {
  const name = error?.name ?? "";
  const message = error?.message ?? "";
  return (
    name === "ChunkLoadError" ||
    /Loading chunk [\d]+ failed/i.test(message) ||
    /Failed to load chunk/i.test(message) ||
    /dynamically imported module/i.test(message)
  );
}

export default function CalculatorsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    if (isChunkLoadError(error)) {
      // Guard against a reload loop: only auto-reload once per session.
      const key = "calc-chunk-reload";
      if (typeof window !== "undefined" && !sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        window.location.reload();
      }
    }
  }, [error]);

  const chunk = isChunkLoadError(error);

  return (
    <main className="flex min-h-[60vh] items-center justify-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <h1 className="font-heading text-2xl font-semibold text-[var(--nav-text)]">
          {chunk ? "Refreshing the calculators" : "Something went wrong"}
        </h1>
        <p className="mt-2 text-text-secondary">
          {chunk
            ? "The page needs a quick refresh to load the latest version. If it does not reload on its own, use the button below."
            : "An unexpected error occurred while loading this calculator. Please try again."}
        </p>
        <button
          type="button"
          onClick={() => (chunk ? window.location.reload() : reset())}
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-[var(--nav-primary)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--nav-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-primary)]"
        >
          {chunk ? "Reload page" : "Try again"}
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
