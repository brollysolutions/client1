"use client";

import * as React from "react";
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
  type Values,
} from "nuqs";

import {
  RE_LISTINGS,
  filterListings,
  hasActiveFilters,
  countActiveFilters,
  sortListings,
  type Furnishing,
  type ListingStatus,
  type ListingType,
  type PostedBy,
  type PropertyFilters,
  type RECategory,
  type SortOrder,
} from "@/lib/real-estate";

const RE_CATEGORY_VALUES = ["houses", "apartments", "villas", "plots", "commercial"] as const;
const STATUS_VALUES = ["ready", "under_construction"] as const;
const FURNISHING_VALUES = ["unfurnished", "semi", "furnished"] as const;
const POSTED_BY_VALUES = ["owner", "agent", "builder"] as const;
const LISTING_TYPE_VALUES = ["buy", "rent"] as const;
const SORT_VALUES = ["relevance", "price_asc", "price_desc", "newest"] as const;

// One hook owns every search + filter facet in the URL query string, mirroring
// the nuqs pattern already used by the calculator islands
// (components/calculators/islands/emi-calculator.tsx). Filters are shareable,
// bookmarkable, and survive reload; results derive from RE_LISTINGS via the
// pure filterListings/sortListings engine in lib/real-estate.ts.
const PARSERS = {
  q: parseAsString,
  listingType: parseAsStringLiteral(LISTING_TYPE_VALUES),
  categories: parseAsArrayOf(parseAsStringLiteral(RE_CATEGORY_VALUES)),
  bhk: parseAsArrayOf(parseAsInteger),
  priceMin: parseAsInteger,
  priceMax: parseAsInteger,
  areaMin: parseAsInteger,
  areaMax: parseAsInteger,
  status: parseAsArrayOf(parseAsStringLiteral(STATUS_VALUES)),
  furnishing: parseAsArrayOf(parseAsStringLiteral(FURNISHING_VALUES)),
  amenities: parseAsArrayOf(parseAsString),
  postedBy: parseAsArrayOf(parseAsStringLiteral(POSTED_BY_VALUES)),
  city: parseAsString,
  locality: parseAsString,
  pincode: parseAsString,
  sort: parseAsStringLiteral(SORT_VALUES),
};

function toPropertyFilters(state: Values<typeof PARSERS>): PropertyFilters {
  return {
    q: state.q ?? undefined,
    listingType: (state.listingType ?? undefined) as ListingType | undefined,
    categories: (state.categories ?? undefined) as RECategory[] | undefined,
    bhk: state.bhk ?? undefined,
    priceMin: state.priceMin ?? undefined,
    priceMax: state.priceMax ?? undefined,
    areaMin: state.areaMin ?? undefined,
    areaMax: state.areaMax ?? undefined,
    status: (state.status ?? undefined) as ListingStatus[] | undefined,
    furnishing: (state.furnishing ?? undefined) as Furnishing[] | undefined,
    amenities: state.amenities ?? undefined,
    postedBy: (state.postedBy ?? undefined) as PostedBy[] | undefined,
    city: state.city ?? undefined,
    locality: state.locality ?? undefined,
    pincode: state.pincode ?? undefined,
    sort: (state.sort ?? undefined) as SortOrder | undefined,
  };
}

export function usePropertyFilters() {
  const [state, setState] = useQueryStates(PARSERS, { clearOnDefault: true });

  const filters = React.useMemo(() => toPropertyFilters(state), [state]);

  const setFilters = React.useCallback(
    (patch: Partial<PropertyFilters>) => {
      // nuqs only clears a param when it's explicitly `null`; map our
      // "undefined means no constraint" convention onto that so removing a
      // facet chip actually drops it from the URL instead of no-op'ing.
      const next: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(patch)) {
        next[key] = value === undefined ? null : value;
      }
      setState(next as Parameters<typeof setState>[0]);
    },
    [setState],
  );

  const clearAll = React.useCallback(() => {
    setState(null);
  }, [setState]);

  const results = React.useMemo(
    () => sortListings(filterListings(RE_LISTINGS, filters), filters.sort),
    [filters],
  );

  return {
    filters,
    setFilters,
    clearAll,
    active: hasActiveFilters(filters),
    activeCount: countActiveFilters(filters),
    results,
    resultCount: results.length,
  };
}
