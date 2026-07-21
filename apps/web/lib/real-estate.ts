// Dashboard-scoped real-estate catalog. Mirrors lib/properties.ts (the public
// Properties page mock) but adds a "houses" category split out from villas, per
// the real-estate client dashboard design. Still frontend-only: no property
// backend exists yet, so this is a hardcoded sample; a future branch swaps this
// for /api/v1/properties once the real-estate RLS line-claim gap is fixed (see
// alembic/versions/2b3c4d5e6f7a_add_loan_applications.py).
//
// Structured filter fields (pincode, furnishing, status, amenities, postedBy,
// ageYears, listingType) are hand-authored per listing below. city, locality,
// bhk, areaSqft and priceLakhs are derived from the existing display strings
// (location/meta/price) so there is one source of truth for what a card shows
// and what the filters match against.
import { Building2, Home, LandPlot, TreePine, Warehouse } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { PropertyListing as BaseListing } from "@/lib/properties";

export type RECategory = "houses" | "apartments" | "villas" | "plots" | "commercial";
export type ListingType = "buy" | "rent";
export type Furnishing = "unfurnished" | "semi" | "furnished";
export type ListingStatus = "ready" | "under_construction";
export type PostedBy = "owner" | "agent" | "builder";

type RawListing = Omit<BaseListing, "category"> & {
  category: RECategory;
  pincode: string;
  furnishing: Furnishing;
  status: ListingStatus;
  amenities: string[];
  postedBy: PostedBy;
  ageYears: number;
  listingType: ListingType;
};

export type REListing = RawListing & {
  city: string;
  locality: string;
  bhk: number;
  areaSqft: number;
  priceLakhs: number;
};

export const RE_CATEGORIES: {
  key: RECategory;
  label: string;
  icon: LucideIcon;
  blurb: string;
}[] = [
  {
    key: "houses",
    label: "Residential Houses",
    icon: Home,
    blurb: "Independent houses and row houses on their own plot.",
  },
  {
    key: "apartments",
    label: "Apartments",
    icon: Building2,
    blurb: "Flats and apartment homes, ready to move or under construction.",
  },
  {
    key: "villas",
    label: "Villas",
    icon: TreePine,
    blurb: "Gated-community villas with private gardens and amenities.",
  },
  {
    key: "plots",
    label: "Plots and Land",
    icon: LandPlot,
    blurb: "Residential plots and farm land to build on or hold for later.",
  },
  {
    key: "commercial",
    label: "Commercial",
    icon: Warehouse,
    blurb: "Offices, shops, and commercial spaces for your business.",
  },
];

// Reuses lib/properties.ts imagery (villa-*.svg) for houses since no separate
// house illustrations exist yet.
const RAW_LISTINGS: RawListing[] = [
  {
    id: "h1",
    title: "Independent House",
    location: "Kondapur, Hyderabad",
    price: "₹1.35 Cr",
    type: "House",
    category: "houses",
    meta: "3 bed · 2,100 sqft",
    image: "/illustrations/properties/villa-3.svg",
    pincode: "500084",
    furnishing: "furnished",
    status: "ready",
    amenities: ["parking", "security", "power_backup"],
    postedBy: "owner",
    ageYears: 5,
    listingType: "buy",
  },
  {
    id: "h2",
    title: "3 BHK Row House",
    location: "Bavdhan, Pune",
    price: "₹1.15 Cr",
    type: "House",
    category: "houses",
    meta: "3 bed · 1,900 sqft",
    image: "/illustrations/properties/villa-3.svg",
    pincode: "411021",
    furnishing: "semi",
    status: "ready",
    amenities: ["parking", "lift", "security"],
    postedBy: "agent",
    ageYears: 3,
    listingType: "rent",
  },
  {
    id: "h3",
    title: "2 BHK Independent House",
    location: "Uppal, Hyderabad",
    price: "₹85 L",
    type: "House",
    category: "houses",
    meta: "2 bed · 1,400 sqft",
    image: "/illustrations/properties/villa-1.svg",
    pincode: "500039",
    furnishing: "unfurnished",
    status: "ready",
    amenities: ["parking"],
    postedBy: "owner",
    ageYears: 8,
    listingType: "buy",
  },
  {
    id: "h4",
    title: "Duplex House",
    location: "Kharadi, Pune",
    price: "₹1.05 Cr",
    type: "House",
    category: "houses",
    meta: "3 bed · 2,000 sqft",
    image: "/illustrations/properties/villa-2.svg",
    pincode: "411014",
    furnishing: "unfurnished",
    status: "under_construction",
    amenities: ["parking", "clubhouse", "garden"],
    postedBy: "builder",
    ageYears: 0,
    listingType: "rent",
  },
  {
    id: "h5",
    title: "4 BHK Independent House",
    location: "JP Nagar, Bengaluru",
    price: "₹2.2 Cr",
    type: "House",
    category: "houses",
    meta: "4 bed · 3,000 sqft",
    image: "/illustrations/properties/villa-1.svg",
    pincode: "560078",
    furnishing: "furnished",
    status: "ready",
    amenities: ["parking", "security", "power_backup", "garden"],
    postedBy: "owner",
    ageYears: 2,
    listingType: "buy",
  },
  {
    id: "h6",
    title: "Row House",
    location: "Kompally, Hyderabad",
    price: "₹92 L",
    type: "House",
    category: "houses",
    meta: "3 bed · 1,750 sqft",
    image: "/illustrations/properties/villa-2.svg",
    pincode: "500100",
    furnishing: "semi",
    status: "ready",
    amenities: ["parking", "security"],
    postedBy: "agent",
    ageYears: 6,
    listingType: "buy",
  },
  {
    id: "a1",
    title: "2 BHK Apartment",
    location: "Baner, Pune",
    price: "₹78 L",
    type: "Apartment",
    category: "apartments",
    meta: "2 bed · 1,120 sqft",
    image: "/illustrations/properties/apartment-1.svg",
    pincode: "411045",
    furnishing: "semi",
    status: "ready",
    amenities: ["lift", "gym", "security", "power_backup"],
    postedBy: "agent",
    ageYears: 4,
    listingType: "buy",
  },
  {
    id: "a2",
    title: "1 BHK Apartment",
    location: "Wakad, Pune",
    price: "₹54 L",
    type: "Apartment",
    category: "apartments",
    meta: "1 bed · 640 sqft",
    image: "/illustrations/properties/apartment-2.svg",
    pincode: "411057",
    furnishing: "furnished",
    status: "ready",
    amenities: ["lift", "security"],
    postedBy: "owner",
    ageYears: 3,
    listingType: "rent",
  },
  {
    id: "a3",
    title: "3 BHK Apartment",
    location: "Gachibowli, Hyderabad",
    price: "₹1.2 Cr",
    type: "Apartment",
    category: "apartments",
    meta: "3 bed · 1,750 sqft",
    image: "/illustrations/properties/apartment-3.svg",
    pincode: "500032",
    furnishing: "unfurnished",
    status: "under_construction",
    amenities: ["lift", "gym", "swimming_pool", "clubhouse"],
    postedBy: "builder",
    ageYears: 0,
    listingType: "buy",
  },
  {
    id: "a4",
    title: "2 BHK Apartment",
    location: "Hinjewadi, Pune",
    price: "₹66 L",
    type: "Apartment",
    category: "apartments",
    meta: "2 bed · 980 sqft",
    image: "/illustrations/properties/apartment-1.svg",
    pincode: "411057",
    furnishing: "semi",
    status: "ready",
    amenities: ["lift", "security", "power_backup"],
    postedBy: "agent",
    ageYears: 5,
    listingType: "rent",
  },
  {
    id: "a5",
    title: "3 BHK Apartment",
    location: "Miyapur, Hyderabad",
    price: "₹92 L",
    type: "Apartment",
    category: "apartments",
    meta: "3 bed · 1,450 sqft",
    image: "/illustrations/properties/apartment-2.svg",
    pincode: "500049",
    furnishing: "furnished",
    status: "ready",
    amenities: ["lift", "gym", "security"],
    postedBy: "owner",
    ageYears: 7,
    listingType: "buy",
  },
  {
    id: "a6",
    title: "2 BHK Apartment",
    location: "Electronic City, Bengaluru",
    price: "₹58 L",
    type: "Apartment",
    category: "apartments",
    meta: "2 bed · 1,050 sqft",
    image: "/illustrations/properties/apartment-3.svg",
    pincode: "560100",
    furnishing: "unfurnished",
    status: "under_construction",
    amenities: ["lift", "swimming_pool", "clubhouse", "kids_play_area"],
    postedBy: "builder",
    ageYears: 0,
    listingType: "buy",
  },
  {
    id: "v1",
    title: "3 BHK Villa",
    location: "Whitefield, Bengaluru",
    price: "₹1.6 Cr",
    type: "Villa",
    category: "villas",
    meta: "3 bed · 2,400 sqft",
    image: "/illustrations/properties/villa-1.svg",
    pincode: "560066",
    furnishing: "furnished",
    status: "ready",
    amenities: ["parking", "swimming_pool", "clubhouse", "garden", "security"],
    postedBy: "owner",
    ageYears: 4,
    listingType: "buy",
  },
  {
    id: "v2",
    title: "4 BHK Villa",
    location: "Kompally, Hyderabad",
    price: "₹2.1 Cr",
    type: "Villa",
    category: "villas",
    meta: "4 bed · 3,200 sqft",
    image: "/illustrations/properties/villa-2.svg",
    pincode: "500100",
    furnishing: "semi",
    status: "ready",
    amenities: ["parking", "security", "power_backup", "garden"],
    postedBy: "builder",
    ageYears: 2,
    listingType: "buy",
  },
  {
    id: "v4",
    title: "3 BHK Villa",
    location: "Tellapur, Hyderabad",
    price: "₹1.8 Cr",
    type: "Villa",
    category: "villas",
    meta: "3 bed · 2,650 sqft",
    image: "/illustrations/properties/villa-1.svg",
    pincode: "502032",
    furnishing: "unfurnished",
    status: "under_construction",
    amenities: ["parking", "clubhouse", "swimming_pool"],
    postedBy: "builder",
    ageYears: 0,
    listingType: "rent",
  },
  {
    id: "v5",
    title: "4 BHK Villa",
    location: "Sarjapur Road, Bengaluru",
    price: "₹2.4 Cr",
    type: "Villa",
    category: "villas",
    meta: "4 bed · 3,500 sqft",
    image: "/illustrations/properties/villa-2.svg",
    pincode: "560035",
    furnishing: "furnished",
    status: "ready",
    amenities: ["parking", "swimming_pool", "security", "garden", "gym"],
    postedBy: "agent",
    ageYears: 3,
    listingType: "buy",
  },
  {
    id: "p1",
    title: "Residential Plot",
    location: "Shankarpally, Hyderabad",
    price: "₹42 L",
    type: "Plot",
    category: "plots",
    meta: "200 sq yd",
    image: "/illustrations/properties/plot-1.svg",
    pincode: "501203",
    furnishing: "unfurnished",
    status: "ready",
    amenities: ["security"],
    postedBy: "owner",
    ageYears: 0,
    listingType: "buy",
  },
  {
    id: "p2",
    title: "Farm Land",
    location: "Chevella, Telangana",
    price: "₹28 L",
    type: "Land",
    category: "plots",
    meta: "1 acre",
    image: "/illustrations/properties/plot-2.svg",
    pincode: "501503",
    furnishing: "unfurnished",
    status: "ready",
    amenities: [],
    postedBy: "owner",
    ageYears: 0,
    listingType: "buy",
  },
  {
    id: "p3",
    title: "Corner Plot",
    location: "Sarjapur, Bengaluru",
    price: "₹65 L",
    type: "Plot",
    category: "plots",
    meta: "300 sq yd",
    image: "/illustrations/properties/plot-3.svg",
    pincode: "562125",
    furnishing: "unfurnished",
    status: "ready",
    amenities: ["security"],
    postedBy: "agent",
    ageYears: 0,
    listingType: "buy",
  },
  {
    id: "p4",
    title: "Residential Plot",
    location: "Mokila, Hyderabad",
    price: "₹38 L",
    type: "Plot",
    category: "plots",
    meta: "167 sq yd",
    image: "/illustrations/properties/plot-1.svg",
    pincode: "501203",
    furnishing: "unfurnished",
    status: "ready",
    amenities: [],
    postedBy: "owner",
    ageYears: 0,
    listingType: "buy",
  },
  {
    id: "p5",
    title: "Gated Community Plot",
    location: "Maheshwaram, Hyderabad",
    price: "₹52 L",
    type: "Plot",
    category: "plots",
    meta: "267 sq yd",
    image: "/illustrations/properties/plot-2.svg",
    pincode: "501510",
    furnishing: "unfurnished",
    status: "ready",
    amenities: ["security", "clubhouse"],
    postedBy: "builder",
    ageYears: 0,
    listingType: "buy",
  },
  {
    id: "p6",
    title: "Residential Plot",
    location: "Devanahalli, Bengaluru",
    price: "₹48 L",
    type: "Plot",
    category: "plots",
    meta: "150 sq yd",
    image: "/illustrations/properties/plot-3.svg",
    pincode: "562110",
    furnishing: "unfurnished",
    status: "ready",
    amenities: [],
    postedBy: "owner",
    ageYears: 0,
    listingType: "buy",
  },
  {
    id: "c1",
    title: "Commercial Shop",
    location: "Kukatpally, Hyderabad",
    price: "₹95 L",
    type: "Shop",
    category: "commercial",
    meta: "650 sqft",
    image: "/illustrations/properties/commercial-1.svg",
    pincode: "500072",
    furnishing: "unfurnished",
    status: "ready",
    amenities: ["parking", "security"],
    postedBy: "owner",
    ageYears: 6,
    listingType: "buy",
  },
  {
    id: "c2",
    title: "Office Space",
    location: "Baner, Pune",
    price: "₹1.1 Cr",
    type: "Office",
    category: "commercial",
    meta: "1,200 sqft",
    image: "/illustrations/properties/commercial-2.svg",
    pincode: "411045",
    furnishing: "furnished",
    status: "ready",
    amenities: ["parking", "lift", "power_backup", "security"],
    postedBy: "agent",
    ageYears: 4,
    listingType: "rent",
  },
  {
    id: "c3",
    title: "Retail Showroom",
    location: "Madhapur, Hyderabad",
    price: "₹1.8 Cr",
    type: "Showroom",
    category: "commercial",
    meta: "1,800 sqft",
    image: "/illustrations/properties/commercial-3.svg",
    pincode: "500081",
    furnishing: "semi",
    status: "ready",
    amenities: ["parking", "security"],
    postedBy: "owner",
    ageYears: 5,
    listingType: "buy",
  },
  {
    id: "c4",
    title: "Office Space",
    location: "HITEC City, Hyderabad",
    price: "₹2.6 Cr",
    type: "Office",
    category: "commercial",
    meta: "2,400 sqft",
    image: "/illustrations/properties/commercial-1.svg",
    pincode: "500081",
    furnishing: "unfurnished",
    status: "under_construction",
    amenities: ["parking", "lift", "power_backup"],
    postedBy: "builder",
    ageYears: 0,
    listingType: "buy",
  },
  {
    id: "c5",
    title: "Commercial Shop",
    location: "Viman Nagar, Pune",
    price: "₹85 L",
    type: "Shop",
    category: "commercial",
    meta: "520 sqft",
    image: "/illustrations/properties/commercial-2.svg",
    pincode: "411014",
    furnishing: "unfurnished",
    status: "ready",
    amenities: ["parking"],
    postedBy: "agent",
    ageYears: 3,
    listingType: "rent",
  },
  {
    id: "c6",
    title: "Warehouse Unit",
    location: "Medchal, Hyderabad",
    price: "₹1.4 Cr",
    type: "Warehouse",
    category: "commercial",
    meta: "4,000 sqft",
    image: "/illustrations/properties/commercial-3.svg",
    pincode: "501401",
    furnishing: "unfurnished",
    status: "ready",
    amenities: ["parking", "security", "power_backup"],
    postedBy: "owner",
    ageYears: 7,
    listingType: "buy",
  },
];

// Splits the existing "Locality, City" display string. Falls back to using the
// whole string as both fields when there's no comma (keeps search/filters safe
// even if a future entry is authored without one).
function parseLocation(location: string): { locality: string; city: string } {
  const [locality, city] = location.split(",").map((part) => part.trim());
  return { locality: locality ?? location, city: city ?? locality ?? location };
}

// BHK comes from the "N bed · ..." prefix on meta. Plots and commercial units
// have no bedroom count, so they fall through to 0 (meaning "not applicable").
function parseBhk(meta?: string): number {
  const match = meta?.match(/^(\d+)\s*bed/i);
  return match ? Number.parseInt(match[1], 10) : 0;
}

// Area comes in three shapes across the mock catalog: "X,XXX sqft" (houses,
// apartments, villas, commercial), "X sq yd" and "X acre" (plots). Normalizes
// all of them to sqft so area range filtering has one unit to compare.
function parseAreaSqft(meta?: string): number {
  if (!meta) return 0;
  const sqft = meta.match(/([\d,]+)\s*sqft/i);
  if (sqft) return Number.parseInt(sqft[1].replace(/,/g, ""), 10);
  const sqYd = meta.match(/([\d,]+)\s*sq\s*yd/i);
  if (sqYd) return Math.round(Number.parseInt(sqYd[1].replace(/,/g, ""), 10) * 9);
  const acre = meta.match(/([\d.]+)\s*acre/i);
  if (acre) return Math.round(Number.parseFloat(acre[1]) * 43560);
  return 0;
}

function deriveListing(raw: RawListing): REListing {
  const { locality, city } = parseLocation(raw.location);
  return {
    ...raw,
    locality,
    city,
    bhk: parseBhk(raw.meta),
    areaSqft: parseAreaSqft(raw.meta),
    priceLakhs: priceInLakhs(raw.price),
  };
}

export const RE_LISTINGS: REListing[] = RAW_LISTINGS.map(deriveListing);

export function getListingsByCategory(category: RECategory): REListing[] {
  return RE_LISTINGS.filter((listing) => listing.category === category);
}

export function getListingById(id: string): REListing | undefined {
  return RE_LISTINGS.find((listing) => listing.id === id);
}

export function getRECategory(key: string): (typeof RE_CATEGORIES)[number] | undefined {
  return RE_CATEGORIES.find((c) => c.key === key);
}

// Unique display locations, in first-seen order. Kept for callers that still
// want the combined "Locality, City" string (e.g. a plain location filter).
export const LOCATIONS: string[] = Array.from(
  new Set(RE_LISTINGS.map((l) => l.location)),
);

// Parses a display price like "₹78 L" or "₹1.2 Cr" into a lakh-denominated
// number. Source of truth for REListing.priceLakhs above; exported so any
// caller that only has the display string (not a full listing) can convert it.
export function priceInLakhs(display: string): number {
  const match = display.match(/₹([\d.]+)\s*(L|Cr)/i);
  if (!match) return 0;
  const value = Number.parseFloat(match[1]);
  return match[2].toLowerCase() === "cr" ? value * 100 : value;
}

export type SortOrder = "relevance" | "price_asc" | "price_desc" | "newest";

export type PropertyFilters = {
  q?: string;
  listingType?: ListingType;
  categories?: RECategory[];
  bhk?: number[];
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
  status?: ListingStatus[];
  furnishing?: Furnishing[];
  amenities?: string[];
  postedBy?: PostedBy[];
  city?: string;
  locality?: string;
  pincode?: string;
  sort?: SortOrder;
};

const FACET_KEYS = [
  "listingType",
  "categories",
  "bhk",
  "priceMin",
  "priceMax",
  "areaMin",
  "areaMax",
  "status",
  "furnishing",
  "amenities",
  "postedBy",
  "city",
  "locality",
  "pincode",
] as const;

// Pure predicate chain: every facet is optional and an empty/undefined value
// means "no constraint". Runs over whatever listings are passed in (not just
// the mock RE_LISTINGS) so this drops onto a real /api/v1/properties response
// with no change once that endpoint exists.
export function filterListings(listings: REListing[], filters: PropertyFilters): REListing[] {
  const q = filters.q?.trim().toLowerCase();
  return listings.filter((listing) => {
    if (filters.listingType && listing.listingType !== filters.listingType) return false;
    if (filters.categories?.length && !filters.categories.includes(listing.category)) return false;
    if (filters.bhk?.length && !filters.bhk.includes(listing.bhk)) return false;
    if (filters.priceMin != null && listing.priceLakhs < filters.priceMin) return false;
    if (filters.priceMax != null && listing.priceLakhs > filters.priceMax) return false;
    if (filters.areaMin != null && listing.areaSqft < filters.areaMin) return false;
    if (filters.areaMax != null && listing.areaSqft > filters.areaMax) return false;
    if (filters.status?.length && !filters.status.includes(listing.status)) return false;
    if (filters.furnishing?.length && !filters.furnishing.includes(listing.furnishing)) return false;
    if (filters.amenities?.length && !filters.amenities.every((a) => listing.amenities.includes(a)))
      return false;
    if (filters.postedBy?.length && !filters.postedBy.includes(listing.postedBy)) return false;
    if (filters.city && listing.city !== filters.city) return false;
    if (filters.locality && listing.locality !== filters.locality) return false;
    if (filters.pincode && listing.pincode !== filters.pincode) return false;
    if (q) {
      const haystack = `${listing.title} ${listing.locality} ${listing.city} ${listing.pincode}`.toLowerCase();
      if (!haystack.includes(q)) return false;
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
