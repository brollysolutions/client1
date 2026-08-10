"use client";

import * as React from "react";
import { SearchX } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { DASHBOARD_ICONS } from "@/features/dashboard/dashboard-icons";
import {
  DashboardHeader,
  DashboardPage,
  MetricCard,
  MetricGrid,
} from "@/features/dashboard/dashboard-ui";
import { FetchError } from "@/features/dashboard/fetch-error";
import { PropertyCard } from "@/features/real-estate/property-card";
import { PropertyRow } from "@/features/real-estate/property-row";
import { PropertySearchBar } from "@/features/real-estate/property-search-bar";
import { usePropertyFilters } from "@/features/real-estate/use-property-filters";
import { useProperties } from "@/features/real-estate/use-properties";
import { useBookmarks } from "@/features/real-estate/store";
import { buildSuggestionIndex } from "@/lib/property-facets";
import { RE_CATEGORIES } from "@/lib/real-estate";

// Real-estate client home: omnibox search + filters on top, then either the
// category-wise rows (default, no filters active) or a filtered results grid.
// Client Component since search/filter state is interactive and URL-synced
// (see use-property-filters.ts). The catalog is fetched once (token is
// in-memory, so no server fetch); the filter engine runs client-side over it.
export function RealEstateHome() {
  const { listings, loading, error, retry } = useProperties();
  const { count: bookmarkCount } = useBookmarks();
  const { filters, setFilters, clearAll, active, activeCount, results, resultCount } =
    usePropertyFilters({ source: listings });
  const suggestionIndex = React.useMemo(() => buildSuggestionIndex(listings), [listings]);

  const heading = (
    <DashboardHeader
      eyebrow="Real Estate workspace"
      title="Find your next property"
      description="Search by locality, city, PIN code, or property name, then save and compare the best matches."
    />
  );

  if (loading) {
    return (
      <DashboardPage>
        {heading}
        <Skeleton className="h-40 rounded-xl" />
      </DashboardPage>
    );
  }

  if (error) {
    return (
      <DashboardPage>
        {heading}
        <FetchError status={null} message={error} onRetry={retry} />
      </DashboardPage>
    );
  }

  const cityCount = new Set(listings.map((listing) => listing.city).filter(Boolean)).size;
  const categoryCount = new Set(listings.map((listing) => listing.category)).size;

  return (
    <DashboardPage>
        {heading}

        <MetricGrid>
          <MetricCard label="Available properties" value={listings.length} icon={DASHBOARD_ICONS.propertyListings} />
          <MetricCard label="Saved properties" value={bookmarkCount} icon={DASHBOARD_ICONS.bookmarks} href="/dashboard/bookmarks" />
          <MetricCard label="Cities" value={cityCount} icon={DASHBOARD_ICONS.explore} />
          <MetricCard label="Property categories" value={categoryCount} icon={DASHBOARD_ICONS.propertyListings} />
        </MetricGrid>

        <PropertySearchBar
          filters={filters}
          setFilters={setFilters}
          clearAll={clearAll}
          activeCount={activeCount}
          resultCount={resultCount}
          active={active}
          suggestionIndex={suggestionIndex}
        />

        {active ? (
          resultCount === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-text-secondary">
                <SearchX className="h-6 w-6" />
              </span>
              <h2 className="mt-5 text-lg font-semibold text-text-primary">No properties match</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
                Try removing a filter or clearing them all.
              </p>
            </div>
          ) : (
            <div>
              <p className="mb-4 text-sm text-text-secondary">
                {resultCount} propert{resultCount === 1 ? "y" : "ies"} found
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {results.map((listing) => (
                  <PropertyCard key={listing.id} listing={listing} fluid />
                ))}
              </div>
            </div>
          )
        ) : null}
      {active ? null : (
        <div className="space-y-8">
          {RE_CATEGORIES.map((cat) => (
            <PropertyRow
              key={cat.key}
              id={cat.key}
              heading={cat.label}
              blurb={cat.blurb}
              listings={listings.filter((l) => l.category === cat.key)}
            />
          ))}
        </div>
      )}
    </DashboardPage>
  );
}
