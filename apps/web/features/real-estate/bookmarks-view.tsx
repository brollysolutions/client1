"use client";

import Link from "next/link";
import { Bookmark } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { FetchError } from "@/features/dashboard/fetch-error";
import { DashboardHeader, DashboardPage } from "@/features/dashboard/dashboard-ui";
import { PropertyBrowser } from "@/features/real-estate/property-browser";
import { useBookmarks } from "@/features/real-estate/store";
import { useProperties } from "@/features/real-estate/use-properties";

// Bookmarked-properties grid. Reads ids from the shared, server-backed
// bookmarks store and resolves them against the mock catalog; a ghost
// bookmark (removed from the catalog) is silently dropped rather than shown
// broken. Search + filter are scoped to the bookmarked set and sit beside the
// heading.
export function BookmarksView() {
  const { ids, status, error, retry } = useBookmarks();
  const { listings: catalog, loading: catalogLoading, error: catalogError, retry: catalogRetry } =
    useProperties();

  // Resolve saved ids against the fetched catalog; a ghost bookmark (removed
  // from the catalog) is silently dropped rather than shown broken.
  const byId = new Map(catalog.map((l) => [l.id, l]));
  const listings = ids
    .map((id) => byId.get(id))
    .filter((l): l is NonNullable<typeof l> => Boolean(l));

  const loading = status === "loading" || catalogLoading;
  const errorMessage = status === "error" ? error : catalogError;

  const heading = (
    <DashboardHeader
      eyebrow="Real Estate shortlist"
      title="Bookmarks"
      description="Search, filter, and compare the properties you saved for later."
    />
  );

  return (
    <DashboardPage>
      {loading ? (
        <>
          {heading}
          <Skeleton className="h-40 rounded-xl" />
        </>
      ) : errorMessage ? (
        <>
          {heading}
          <FetchError
            status={null}
            message={errorMessage}
            onRetry={status === "error" ? retry : catalogRetry}
          />
        </>
      ) : listings.length === 0 ? (
        <>
          {heading}
          <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-text-secondary">
              <Bookmark className="h-6 w-6" />
            </span>
            <h2 className="mt-5 text-lg font-semibold text-text-primary">No bookmarks yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
              Tap the bookmark icon on any property to save it here.
            </p>
            <Link
              href="/dashboard/explore"
              className="mt-4 inline-block text-sm font-semibold text-brand-cta hover:underline"
            >
              Explore properties
            </Link>
          </div>
        </>
      ) : (
        <PropertyBrowser source={listings} header={heading} />
      )}
    </DashboardPage>
  );
}
