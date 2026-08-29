import { Building2, Home, LandPlot, TreePine, Warehouse } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { components } from "@contracts/generated/schema";

import type { PropertyListing as BaseListing } from "@/lib/properties";
import { categoryArtwork } from "@/lib/property-artwork";

// Derived from the generated contract, never hand-declared: a category,
// furnishing state, or construction status the backend adds later must surface
// as a compile error here (and in RE_CATEGORIES / the parser tuples in
// lib/property-facets.ts), not as a value the dashboard silently never renders.
type Schemas = components["schemas"];
export type RECategory = Schemas["PropertyCategory"];
export type RESubtype = Schemas["PropertySubtype"];
export type Furnishing = Schemas["Furnishing"];
export type ListingStatus = Schemas["ConstructionStatus"];

// Dashboard listings are populated from the authenticated property API. Keep
// this module limited to types and pure filtering so production search never
// falls back to a frontend-authored city, locality, PIN, or sample listing.
export type REListing = Omit<BaseListing, "category" | "reraNumber"> & {
  category: RECategory;
  pincode: string;
  furnishing: Furnishing | null;
  status: ListingStatus | null;
  amenities: string[];
  ageYears: number;
  city: string;
  locality: string;
  state?: string;
  bhk: number;
  areaSqft: number;
  priceLakhs: number;
  constructionStatus?: ListingStatus | null;
  /** Rent-only terms; all null on a sale listing. */
  securityDepositPaise?: number | null;
  minimumLeaseMonths?: number | null;
  availableFrom?: string | null;
  listingLinks?: components["schemas"]["ListingLink"][] | null;
  reraApplicability?: components["schemas"]["ReraApplicability"];
  reraNumber?: string | null;
  reraVerificationStatus?: components["schemas"]["ReraVerificationStatus"];
  structuredDetails?: components["schemas"]["PropertyRead"]["structured_details"];
};

export const RE_CATEGORIES: {
  key: RECategory;
  label: string;
  icon: LucideIcon;
  blurb: string;
  // Local generated representative artwork for the dashboard's category cards.
  // One subtype stands in for a category with more than one (apartments ->
  // gated community, commercial -> unlocked space).
  illustration: string;
}[] = [
  {
    key: "houses",
    label: "Residential Houses",
    icon: Home,
    blurb: "Independent houses and row houses on their own plot.",
    illustration: categoryArtwork("houses"),
  },
  {
    key: "apartments",
    label: "Apartments",
    icon: Building2,
    blurb: "Flats and apartment homes, ready to move or under construction.",
    illustration: categoryArtwork("apartments"),
  },
  {
    key: "villas",
    label: "Villas",
    icon: TreePine,
    blurb: "Gated-community villas with private gardens and amenities.",
    illustration: categoryArtwork("villas"),
  },
  {
    key: "plots",
    label: "Plots and Land",
    icon: LandPlot,
    blurb: "Residential plots and farm land to build on or hold for later.",
    illustration: categoryArtwork("plots"),
  },
  {
    key: "commercial",
    label: "Commercial",
    icon: Warehouse,
    blurb: "Offices, shops, and commercial spaces for your business.",
    illustration: categoryArtwork("commercial"),
  },
];

export function getRECategory(key: string): (typeof RE_CATEGORIES)[number] | undefined {
  return RE_CATEGORIES.find((category) => category.key === key);
}

export function populatedPropertyCategories(listings: REListing[]) {
  return RE_CATEGORIES.flatMap((category) => {
    const categoryListings = listings.filter((listing) => listing.category === category.key);
    return categoryListings.length > 0 ? [{ category, listings: categoryListings }] : [];
  });
}

export type SortOrder = "relevance" | "price_asc" | "price_desc" | "newest";

export type PropertyFilters = {
  q?: string;
  /** Sale vs rent/lease. Also scopes the price facet, whose ranges differ by an
   * order of magnitude between a sale price and a monthly rent. */
  intent?: components["schemas"]["ListingIntent"][];
  categories?: RECategory[];
  subtypes?: RESubtype[];
  bhk?: number[];
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
  status?: ListingStatus[];
  furnishing?: Furnishing[];
  amenities?: string[];
  city?: string;
  locality?: string;
  pincode?: string;
  sort?: SortOrder;
};

const FACET_KEYS = [
  "intent",
  "categories",
  "subtypes",
  "bhk",
  "priceMin",
  "priceMax",
  "areaMin",
  "areaMax",
  "status",
  "furnishing",
  "amenities",
  "city",
  "locality",
  "pincode",
] as const;

export function filterListings(listings: REListing[], filters: PropertyFilters): REListing[] {
  const query = filters.q?.trim().toLowerCase();
  return listings.filter((listing) => {
    if (filters.intent?.length && !filters.intent.includes(listing.listingIntent)) return false;
    if (filters.categories?.length && !filters.categories.includes(listing.category)) return false;
    // Legacy rows carry no subtype. Asking for a subtype is a narrower question
    // than asking for its category, so an unclassified listing cannot answer it
    // and is excluded rather than assumed to match.
    if (
      filters.subtypes?.length &&
      (!listing.propertySubtype || !filters.subtypes.includes(listing.propertySubtype))
    ) {
      return false;
    }
    if (filters.bhk?.length && !filters.bhk.includes(listing.bhk)) return false;
    if (filters.priceMin != null && listing.priceLakhs < filters.priceMin) return false;
    if (filters.priceMax != null && listing.priceLakhs > filters.priceMax) return false;
    if (filters.areaMin != null && listing.areaSqft < filters.areaMin) return false;
    if (filters.areaMax != null && listing.areaSqft > filters.areaMax) return false;
    if (filters.status?.length && (!listing.status || !filters.status.includes(listing.status))) return false;
    if (filters.furnishing?.length && (!listing.furnishing || !filters.furnishing.includes(listing.furnishing))) return false;
    if (filters.amenities?.length && !filters.amenities.every((item) => listing.amenities.includes(item))) {
      return false;
    }
    if (filters.city && listing.city !== filters.city) return false;
    if (filters.locality && listing.locality !== filters.locality) return false;
    if (filters.pincode && listing.pincode !== filters.pincode) return false;
    if (query) {
      const haystack = `${listing.title} ${listing.locality} ${listing.city} ${listing.pincode}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export function sortListings(listings: REListing[], sort: SortOrder = "relevance"): REListing[] {
  if (sort === "relevance") return listings;
  const sorted = [...listings];
  if (sort === "price_asc") sorted.sort((a, b) => a.priceLakhs - b.priceLakhs);
  if (sort === "price_desc") sorted.sort((a, b) => b.priceLakhs - a.priceLakhs);
  if (sort === "newest") sorted.sort((a, b) => a.ageYears - b.ageYears);
  return sorted;
}

export function hasActiveFilters(filters: PropertyFilters): boolean {
  if (filters.q?.trim()) return true;
  return FACET_KEYS.some((key) => {
    const value = filters[key];
    return Array.isArray(value) ? value.length > 0 : value != null && value !== "";
  });
}

export function countActiveFilters(filters: PropertyFilters): number {
  let count = filters.q?.trim() ? 1 : 0;
  for (const key of FACET_KEYS) {
    const value = filters[key];
    if (Array.isArray(value)) {
      if (value.length > 0) count += 1;
    } else if (value != null && value !== "") {
      count += 1;
    }
  }
  return count;
}
