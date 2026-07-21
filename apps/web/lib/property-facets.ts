// Facet option lists and the omnibox suggestion index for the dashboard
// property search + filter Sheet. Pure data/derivations over REListing so
// they stay in sync with lib/real-estate.ts without hand duplication.
import {
  RE_LISTINGS,
  type Furnishing,
  type ListingStatus,
  type ListingType,
  type PostedBy,
  type REListing,
} from "@/lib/real-estate";

export const LISTING_TYPES: { value: ListingType; label: string }[] = [
  { value: "buy", label: "Buy" },
  { value: "rent", label: "Rent" },
];

export const BHK_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "1 BHK" },
  { value: 2, label: "2 BHK" },
  { value: 3, label: "3 BHK" },
  { value: 4, label: "4 BHK" },
  { value: 5, label: "5+ BHK" },
];

export const STATUS_OPTIONS: { value: ListingStatus; label: string }[] = [
  { value: "ready", label: "Ready to move" },
  { value: "under_construction", label: "Under construction" },
];

export const FURNISHING_OPTIONS: { value: Furnishing; label: string }[] = [
  { value: "unfurnished", label: "Unfurnished" },
  { value: "semi", label: "Semi-furnished" },
  { value: "furnished", label: "Furnished" },
];

export const POSTED_BY_OPTIONS: { value: PostedBy; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "agent", label: "Agent" },
  { value: "builder", label: "Builder" },
];

export const AMENITIES: { value: string; label: string }[] = [
  { value: "parking", label: "Parking" },
  { value: "lift", label: "Lift" },
  { value: "gym", label: "Gym" },
  { value: "swimming_pool", label: "Swimming pool" },
  { value: "security", label: "Security" },
  { value: "power_backup", label: "Power backup" },
  { value: "clubhouse", label: "Clubhouse" },
  { value: "garden", label: "Garden" },
  { value: "kids_play_area", label: "Kids' play area" },
];

export const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "newest", label: "Newest" },
];

export function priceBounds(listings: REListing[]): { min: number; max: number } {
  if (listings.length === 0) return { min: 0, max: 500 };
  const values = listings.map((l) => l.priceLakhs);
  return { min: Math.floor(Math.min(...values)), max: Math.ceil(Math.max(...values)) };
}

export function areaBounds(listings: REListing[]): { min: number; max: number } {
  const values = listings.map((l) => l.areaSqft).filter((v) => v > 0);
  if (values.length === 0) return { min: 0, max: 5000 };
  return { min: Math.floor(Math.min(...values)), max: Math.ceil(Math.max(...values)) };
}

// Formats a lakh-denominated price for slider labels and chips: "₹50 L" below
// a crore, "₹1.2 Cr" at or above it. Mirrors the "₹X L" / "₹X Cr" shape
// already used by the display price strings in lib/real-estate.ts.
export function formatLakhs(value: number): string {
  if (value >= 100) {
    const cr = value / 100;
    return `₹${Number.isInteger(cr) ? cr : cr.toFixed(1)} Cr`;
  }
  return `₹${value} L`;
}

export type SuggestionGroup = { label: string; values: string[] };

export type SuggestionIndex = {
  localities: string[];
  cities: string[];
  pincodes: string[];
  properties: { id: string; title: string; locality: string; city: string }[];
};

// Grouped, de-duplicated suggestion source for the search omnibox. Built once
// from the mock catalog; swaps for a real search endpoint response later.
export function buildSuggestionIndex(listings: REListing[]): SuggestionIndex {
  return {
    localities: Array.from(new Set(listings.map((l) => l.locality))).sort(),
    cities: Array.from(new Set(listings.map((l) => l.city))).sort(),
    pincodes: Array.from(new Set(listings.map((l) => l.pincode))).sort(),
    properties: listings.map((l) => ({ id: l.id, title: l.title, locality: l.locality, city: l.city })),
  };
}

// Precomputed once from the mock catalog for the search bar + filter Sheet.
export const CITIES: string[] = Array.from(new Set(RE_LISTINGS.map((l) => l.city))).sort();
export const PRICE_BOUNDS = priceBounds(RE_LISTINGS);
export const AREA_BOUNDS = areaBounds(RE_LISTINGS);
export const SUGGESTION_INDEX = buildSuggestionIndex(RE_LISTINGS);
