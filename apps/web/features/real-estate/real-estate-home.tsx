"use client";

import { SearchX } from "lucide-react";

import { PropertyCard } from "@/features/real-estate/property-card";
import { PropertyRow } from "@/features/real-estate/property-row";
import { PropertySearchBar } from "@/features/real-estate/property-search-bar";
import { usePropertyFilters } from "@/features/real-estate/use-property-filters";
import { RE_CATEGORIES, getListingsByCategory } from "@/lib/real-estate";

// Real-estate client home: omnibox search + filters on top, then either the
// category-wise rows (default, no filters active) or a filtered results grid.
// Client Component since search/filter state is interactive and URL-synced
// (see use-property-filters.ts).
export function RealEstateHome() {
  const { filters, setFilters, clearAll, active, activeCount, results, resultCount } =
    usePropertyFilters();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Real Estate</h1>
        <p className="text-sm text-text-secondary">
          Search properties by locality, city, PIN code, or name, or browse by category below.
        </p>
      </div>

      <PropertySearchBar
        filters={filters}
        setFilters={setFilters}
        clearAll={clearAll}
        activeCount={activeCount}
        resultCount={resultCount}
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((listing) => (
                <PropertyCard key={listing.id} listing={listing} />
              ))}
            </div>
          </div>
        )
      ) : (
        <div className="space-y-8">
          {RE_CATEGORIES.map((cat) => (
            <PropertyRow
              key={cat.key}
              id={cat.key}
              heading={cat.label}
              blurb={cat.blurb}
              listings={getListingsByCategory(cat.key)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
