import { describe, expect, it } from "vitest";

import {
  countActiveFilters,
  filterListings,
  hasActiveFilters,
  sortListings,
  type REListing,
} from "@/lib/real-estate";

const LISTINGS = [
  {
    id: "apartment-one",
    title: "River Apartment",
    location: "District One, City Alpha",
    price: "₹78 L",
    type: "Apartment",
    category: "apartments",
    meta: "2 bed · 1,120 sqft",
    pincode: "100001",
    furnishing: "semi",
    status: "ready",
    amenities: ["lift", "gym", "security"],
    ageYears: 4,
    city: "City Alpha",
    locality: "District One",
    bhk: 2,
    areaSqft: 1120,
    priceLakhs: 78,
  },
  {
    id: "apartment-two",
    title: "Park Apartment",
    location: "District Two, City Beta",
    price: "₹1.2 Cr",
    type: "Apartment",
    category: "apartments",
    meta: "3 bed · 1,750 sqft",
    pincode: "200002",
    furnishing: "furnished",
    status: "under_construction",
    amenities: ["parking", "security"],
    ageYears: 0,
    city: "City Beta",
    locality: "District Two",
    bhk: 3,
    areaSqft: 1750,
    priceLakhs: 120,
  },
  {
    id: "villa-one",
    title: "Garden Villa",
    location: "Garden Zone, City Alpha",
    price: "₹1.5 Cr",
    type: "Villa",
    category: "villas",
    meta: "4 bed · 2,400 sqft",
    pincode: "100002",
    furnishing: "furnished",
    status: "ready",
    amenities: ["parking", "security", "garden"],
    ageYears: 2,
    city: "City Alpha",
    locality: "Garden Zone",
    bhk: 4,
    areaSqft: 2400,
    priceLakhs: 150,
  },
  {
    id: "plot-one",
    title: "Residential Plot",
    location: "Plot Zone, City Beta",
    price: "₹42 L",
    type: "Plot",
    category: "plots",
    meta: "1,800 sqft",
    pincode: "200003",
    furnishing: "unfurnished",
    status: "ready",
    amenities: ["security"],
    ageYears: 0,
    city: "City Beta",
    locality: "Plot Zone",
    bhk: 0,
    areaSqft: 1800,
    priceLakhs: 42,
  },
  {
    id: "commercial-one",
    title: "Market Shop",
    location: "Market Zone, City Gamma",
    price: "₹95 L",
    type: "Shop",
    category: "commercial",
    meta: "650 sqft",
    pincode: "300001",
    furnishing: "unfurnished",
    status: "ready",
    amenities: ["parking", "security"],
    ageYears: 6,
    city: "City Gamma",
    locality: "Market Zone",
    bhk: 0,
    areaSqft: 650,
    priceLakhs: 95,
  },
] satisfies REListing[];

describe("filterListings()", () => {
  it("returns everything when no facets are set", () => {
    expect(filterListings(LISTINGS, {})).toEqual(LISTINGS);
  });

  it("filters free text across title, locality, city, and PIN", () => {
    expect(filterListings(LISTINGS, { q: "district one" })).toEqual([LISTINGS[0]]);
    expect(filterListings(LISTINGS, { q: "200002" })).toEqual([LISTINGS[1]]);
  });

  it("applies category, bedroom, price, and area facets", () => {
    expect(filterListings(LISTINGS, { categories: ["villas", "plots"] })).toEqual([
      LISTINGS[2],
      LISTINGS[3],
    ]);
    expect(filterListings(LISTINGS, { bhk: [2, 3] })).toEqual([LISTINGS[0], LISTINGS[1]]);
    expect(filterListings(LISTINGS, { priceMin: 50, priceMax: 100 })).toEqual([
      LISTINGS[0],
      LISTINGS[4],
    ]);
    expect(filterListings(LISTINGS, { areaMin: 1000, areaMax: 2000 })).toEqual([
      LISTINGS[0],
      LISTINGS[1],
      LISTINGS[3],
    ]);
  });

  it("applies status, furnishing, and all-selected-amenity facets", () => {
    expect(filterListings(LISTINGS, { status: ["under_construction"] })).toEqual([LISTINGS[1]]);
    expect(filterListings(LISTINGS, { furnishing: ["furnished"] })).toEqual([
      LISTINGS[1],
      LISTINGS[2],
    ]);
    expect(filterListings(LISTINGS, { amenities: ["parking", "security"] })).toEqual([
      LISTINGS[1],
      LISTINGS[2],
      LISTINGS[4],
    ]);
  });

  it("applies exact live-catalog city, locality, and PIN facets", () => {
    expect(filterListings(LISTINGS, { city: "City Alpha" })).toEqual([
      LISTINGS[0],
      LISTINGS[2],
    ]);
    expect(filterListings(LISTINGS, { locality: "District One" })).toEqual([LISTINGS[0]]);
    expect(filterListings(LISTINGS, { pincode: "200003" })).toEqual([LISTINGS[3]]);
  });

  it("combines facets with AND semantics and returns empty for no match", () => {
    expect(
      filterListings(LISTINGS, {
        city: "City Beta",
        categories: ["apartments"],
        bhk: [3],
      }),
    ).toEqual([LISTINGS[1]]);
    expect(filterListings(LISTINGS, { city: "City Alpha", bhk: [99] })).toEqual([]);
  });

  it("works over an arbitrary API-backed listing array", () => {
    expect(filterListings(LISTINGS.slice(0, 2), {})).toEqual(LISTINGS.slice(0, 2));
  });
});

describe("sortListings()", () => {
  it("preserves relevance order and does not mutate input", () => {
    const before = [...LISTINGS];
    expect(sortListings(LISTINGS, "relevance")).toEqual(LISTINGS);
    sortListings(LISTINGS, "price_asc");
    expect(LISTINGS).toEqual(before);
  });

  it("sorts price ascending and descending", () => {
    expect(sortListings(LISTINGS, "price_asc").map((listing) => listing.priceLakhs)).toEqual([
      42, 78, 95, 120, 150,
    ]);
    expect(sortListings(LISTINGS, "price_desc").map((listing) => listing.priceLakhs)).toEqual([
      150, 120, 95, 78, 42,
    ]);
  });
});

describe("hasActiveFilters() / countActiveFilters()", () => {
  it("tracks active facets without counting empty arrays", () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(countActiveFilters({})).toBe(0);
    expect(hasActiveFilters({ bhk: [] })).toBe(false);
    expect(countActiveFilters({ bhk: [] })).toBe(0);
    expect(hasActiveFilters({ city: "City Alpha" })).toBe(true);
    expect(countActiveFilters({ bhk: [2, 3, 4], city: "City Alpha" })).toBe(2);
  });
});
