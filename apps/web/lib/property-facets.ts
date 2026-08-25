// Facet option lists and the omnibox suggestion index for the dashboard
// property search + filter Sheet. Pure data/derivations over REListing so
// they stay in sync with lib/real-estate.ts without hand duplication.
import {
  type Furnishing,
  type ListingStatus,
  type RECategory,
  type REListing,
  type RESubtype,
} from "@/lib/real-estate";

// nuqs needs literal tuples to build its parsers, but a tuple is exactly the
// place a contract union drifts unnoticed: `satisfies readonly RECategory[]`
// only proves every entry is valid, never that every value is present, so a
// category the backend adds later would parse as invalid and silently never
// render.
//
// This closes that gap. The tuple type is inferred from the argument, so the
// exhaustiveness check runs against the literal members: when one is missing the
// parameter type gains a `__missingFromTuple` property the tuple cannot have,
// and the compiler reports the missing value by name. (A `satisfies` clause
// cannot do this — the type argument there is the declared `readonly U[]`, not
// the literal tuple, which makes the Exclude vacuously `never`.)
const exhaustive =
  <U extends string>() =>
  <T extends readonly U[]>(
    values: T &
      ([Exclude<U, T[number]>] extends [never]
        ? unknown
        : { __missingFromTuple: Exclude<U, T[number]> }),
  ): T =>
    values;

export const RE_CATEGORY_VALUES = exhaustive<RECategory>()([
  "houses",
  "apartments",
  "villas",
  "plots",
  "commercial",
] as const);

export const RE_SUBTYPE_VALUES = exhaustive<RESubtype>()([
  "individual_house",
  "standalone_apartment",
  "gated_community_apartment",
  "villa",
  "locked_space",
  "unlocked_space",
  "plot",
  "farmland",
  "agriland",
] as const);

export const STATUS_VALUES = exhaustive<ListingStatus>()(["ready", "under_construction"] as const);

export const FURNISHING_VALUES = exhaustive<Furnishing>()([
  "unfurnished",
  "semi",
  "furnished",
] as const);

export const SORT_VALUES = ["relevance", "price_asc", "price_desc", "newest"] as const;

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
  const min = Math.floor(Math.min(...values));
  const max = Math.ceil(Math.max(...values));
  return min === max ? { min: 0, max: Math.max(max, 1) } : { min, max };
}

export function areaBounds(listings: REListing[]): { min: number; max: number } {
  const values = listings.map((l) => l.areaSqft).filter((v) => v > 0);
  if (values.length === 0) return { min: 0, max: 5000 };
  const min = Math.floor(Math.min(...values));
  const max = Math.ceil(Math.max(...values));
  return min === max ? { min: 0, max: Math.max(max, 1) } : { min, max };
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
  // Subtypes actually present in this result ceiling, in RE_SUBTYPE_VALUES
  // order. Same discipline as localities/cities: never offer a facet that
  // cannot match anything in the current source.
  subtypes: RESubtype[];
  properties: { id: string; title: string; locality: string; city: string }[];
  priceBounds: { min: number; max: number };
  areaBounds: { min: number; max: number };
};

// Grouped, de-duplicated suggestion source for the search omnibox. Every value
// is derived from the authenticated property API response supplied by callers.
export function buildSuggestionIndex(listings: REListing[]): SuggestionIndex {
  const presentSubtypes = new Set(
    listings.map((l) => l.propertySubtype).filter((v): v is RESubtype => Boolean(v)),
  );
  return {
    localities: Array.from(new Set(listings.map((l) => l.locality))).sort(),
    cities: Array.from(new Set(listings.map((l) => l.city))).sort(),
    pincodes: Array.from(new Set(listings.map((l) => l.pincode))).sort(),
    subtypes: RE_SUBTYPE_VALUES.filter((value) => presentSubtypes.has(value)),
    properties: listings.map((l) => ({ id: l.id, title: l.title, locality: l.locality, city: l.city })),
    priceBounds: priceBounds(listings),
    areaBounds: areaBounds(listings),
  };
}
