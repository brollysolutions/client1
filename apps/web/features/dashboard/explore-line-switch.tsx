"use client";

import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { FetchError } from "@/features/dashboard/fetch-error";
import { DashboardHeader, DashboardPage } from "@/features/dashboard/dashboard-ui";
import { useLine } from "@/features/dashboard/line-provider";
import { PropertyBrowser } from "@/features/real-estate/property-browser";
import { PropertyRow } from "@/features/real-estate/property-row";
import { useProperties } from "@/features/real-estate/use-properties";
import { populatedPropertyCategories, type REListing } from "@/lib/real-estate";

// Line switch for /dashboard/explore. The loans hub is a server component
// (its data comes from the anonymous public financial-products catalogue via
// lib/financial-catalog.ts, which throws if imported client-side), so the
// parent page renders it and hands the finished node in as `loansHub` --
// a client component cannot render an async server child directly. The
// real-estate hub stays exactly as it was: a client-side fetch of the
// property catalog feeding a search-first browser.
export function ExploreLineSwitch({ loansHub }: { loansHub: ReactNode }) {
  const { activeLine } = useLine();
  return activeLine === "real_estate" ? <RealEstateExplore /> : <>{loansHub}</>;
}

// Real-estate Explore: fetches the catalog once, then feeds the client-side
// browser (omnibox + filters over the full active set). The token is in-memory,
// so this must be a client fetch, not a server component.
function RealEstateExplore() {
  const { listings, loading, error, retry } = useProperties();

  const header = (
    <DashboardHeader
      title="Explore properties"
      description="Search by property, locality, city, or PIN code, or choose a catalog location directly."
    />
  );

  return (
    <DashboardPage>
      {loading ? (
        <>
          {header}
          <Skeleton className="h-40 rounded-xl" />
        </>
      ) : error ? (
        <>
          {header}
          <FetchError status={null} message={error} onRetry={retry} />
        </>
      ) : listings.length === 0 ? (
        <>
          {header}
          <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
            <h2 className="text-lg font-semibold text-text-primary">No listings yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
              New properties will appear here once they are published. Check back soon.
            </p>
          </div>
        </>
      ) : (
        <PropertyBrowser
          source={listings}
          header={header}
          idle={<RealEstateHub listings={listings} />}
        />
      )}
    </DashboardPage>
  );
}

// Real-estate idle state: one carousel per category. This is exactly the
// content Home used to own -- Home is now a personal status view instead, and
// this is the catalog-browsing home Explore is meant to be, richer than the
// single "Featured properties" row it had before (that row was an arbitrary
// top-10 slice; per-category rows let a client actually browse). No separate
// "Browse by property type" grid precedes these rows (that lives on Home now,
// as illustrated cards). Empty category bands add no browsing value, so Home
// remains their discoverable entry point while Explore shows only live stock.
function RealEstateHub({ listings }: { listings: REListing[] }) {
  return (
    <div className="space-y-8">
      {populatedPropertyCategories(listings).map(({ category, listings: categoryListings }) => (
        <PropertyRow
          key={category.key}
          id={category.key}
          heading={category.label}
          blurb={category.blurb}
          listings={categoryListings}
        />
      ))}
    </div>
  );
}
