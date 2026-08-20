"use client";

import * as React from "react";
import { SearchX } from "lucide-react";

import { PropertyCard } from "@/features/real-estate/property-card";
import { PropertySearchBar } from "@/features/real-estate/property-search-bar";
import { usePropertyFilters } from "@/features/real-estate/use-property-filters";
import { buildSuggestionIndex } from "@/lib/property-facets";
import type { RECategory, REListing } from "@/lib/real-estate";
import { cn } from "@/lib/utils";

// Reusable "omnibox + filter sheet + results grid" surface. Scopes the search
// suggestions and filter engine to the API-backed `source` and
// can pin one category via `lockedCategory`. When no filters are active it shows
// `idle` if provided (the home page's category rows), otherwise the full source
// as a grid (category / bookmark pages). The results grid is a responsive 4-up
// layout of fluid cards, so cards keep their size and pack 4 / 3 / 2 / 1 across
// down the breakpoints.
export function PropertyBrowser({
  source,
  lockedCategory,
  idle,
  header,
}: {
  source: REListing[];
  lockedCategory?: RECategory;
  // Rendered instead of the default full-source grid when no filters are active.
  idle?: React.ReactNode;
  header?: React.ReactNode;
}) {
  const { filters, setFilters, clearAll, active, activeCount, results, resultCount } =
    usePropertyFilters({ source, lockedCategory });

  const suggestionIndex = React.useMemo(() => buildSuggestionIndex(source), [source]);

  const searchBar = (
    <PropertySearchBar
      filters={filters}
      setFilters={setFilters}
      clearAll={clearAll}
      activeCount={activeCount}
      resultCount={resultCount}
      active={active}
      suggestionIndex={suggestionIndex}
      lockedCategory={lockedCategory}
    />
  );

  return (
    <div className="space-y-6">
      {header}
      {searchBar}

      {active ? (
        resultCount === 0 ? (
          <EmptyResults />
        ) : (
          <div>
            <p className="mb-4 text-sm text-text-secondary">
              {resultCount} propert{resultCount === 1 ? "y" : "ies"} found
            </p>
            <ResultsGrid results={results} />
          </div>
        )
      ) : idle !== undefined ? (
        idle
      ) : results.length === 0 ? (
        <EmptyResults />
      ) : (
        <ResultsGrid results={results} />
      )}
    </div>
  );
}

function ResultsGrid({ results }: { results: REListing[] }) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4")}>
      {results.map((listing) => (
        <PropertyCard key={listing.id} listing={listing} fluid />
      ))}
    </div>
  );
}

function EmptyResults() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-text-secondary">
        <SearchX className="h-6 w-6" />
      </span>
      <h2 className="mt-5 text-lg font-semibold text-text-primary">No properties match</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
        Try removing a filter or clearing them all.
      </p>
    </div>
  );
}
