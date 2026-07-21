import { describe, expect, it } from "vitest";

import {
  RE_LISTINGS,
  countActiveFilters,
  filterListings,
  hasActiveFilters,
  priceInLakhs,
  sortListings,
  type REListing,
} from "@/lib/real-estate";

describe("REListing derived fields", () => {
  it("every listing has a positive priceLakhs parsed from its display price", () => {
    expect(RE_LISTINGS.every((l) => l.priceLakhs > 0)).toBe(true);
  });

  it("splits location into locality and city", () => {
    const a1 = RE_LISTINGS.find((l) => l.id === "a1")!;
    expect(a1.locality).toBe("Baner");
    expect(a1.city).toBe("Pune");
  });

  it("parses bhk and areaSqft from meta for residential listings", () => {
    const a1 = RE_LISTINGS.find((l) => l.id === "a1")!;
    expect(a1.bhk).toBe(2);
    expect(a1.areaSqft).toBe(1120);
  });

  it("normalizes plot area units (sq yd, acre) to sqft", () => {
    const p1 = RE_LISTINGS.find((l) => l.id === "p1")!; // "200 sq yd"
    expect(p1.areaSqft).toBe(1800);
    expect(p1.bhk).toBe(0);

    const p2 = RE_LISTINGS.find((l) => l.id === "p2")!; // "1 acre"
    expect(p2.areaSqft).toBe(43560);
  });

  it("gives commercial listings bhk 0", () => {
    const c1 = RE_LISTINGS.find((l) => l.id === "c1")!;
    expect(c1.bhk).toBe(0);
  });
});

describe("priceInLakhs()", () => {
  it("parses lakh values", () => {
    expect(priceInLakhs("₹78 L")).toBe(78);
  });

  it("parses crore values as lakhs", () => {
    expect(priceInLakhs("₹1.2 Cr")).toBe(120);
  });
});

describe("filterListings()", () => {
  it("returns everything when no facets are set", () => {
    expect(filterListings(RE_LISTINGS, {})).toHaveLength(RE_LISTINGS.length);
  });

  it("filters by free-text query across title, locality, city and pincode", () => {
    const byLocality = filterListings(RE_LISTINGS, { q: "baner" });
    expect(byLocality.length).toBeGreaterThan(0);
    expect(byLocality.every((l) => l.locality.toLowerCase().includes("baner"))).toBe(true);

    const byPincode = filterListings(RE_LISTINGS, { q: "411045" });
    expect(byPincode.length).toBeGreaterThan(0);
  });

  it("filters by listingType", () => {
    const rentals = filterListings(RE_LISTINGS, { listingType: "rent" });
    expect(rentals.length).toBeGreaterThan(0);
    expect(rentals.every((l) => l.listingType === "rent")).toBe(true);
  });

  it("filters by category (multi-select)", () => {
    const result = filterListings(RE_LISTINGS, { categories: ["villas", "plots"] });
    expect(result.every((l) => l.category === "villas" || l.category === "plots")).toBe(true);
  });

  it("filters by bhk (multi-select)", () => {
    const result = filterListings(RE_LISTINGS, { bhk: [2, 3] });
    expect(result.every((l) => l.bhk === 2 || l.bhk === 3)).toBe(true);
  });

  it("filters by inclusive price range", () => {
    const result = filterListings(RE_LISTINGS, { priceMin: 50, priceMax: 100 });
    expect(result.every((l) => l.priceLakhs >= 50 && l.priceLakhs <= 100)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it("filters by inclusive area range", () => {
    const result = filterListings(RE_LISTINGS, { areaMin: 1000, areaMax: 2000 });
    expect(result.every((l) => l.areaSqft >= 1000 && l.areaSqft <= 2000)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it("filters by construction status", () => {
    const result = filterListings(RE_LISTINGS, { status: ["under_construction"] });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((l) => l.status === "under_construction")).toBe(true);
  });

  it("filters by furnishing", () => {
    const result = filterListings(RE_LISTINGS, { furnishing: ["furnished"] });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((l) => l.furnishing === "furnished")).toBe(true);
  });

  it("requires ALL selected amenities to be present (AND, not OR)", () => {
    const result = filterListings(RE_LISTINGS, { amenities: ["parking", "security"] });
    expect(result.length).toBeGreaterThan(0);
    expect(
      result.every((l) => l.amenities.includes("parking") && l.amenities.includes("security")),
    ).toBe(true);
  });

  it("filters by postedBy", () => {
    const result = filterListings(RE_LISTINGS, { postedBy: ["builder"] });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((l) => l.postedBy === "builder")).toBe(true);
  });

  it("filters by exact city and locality", () => {
    expect(filterListings(RE_LISTINGS, { city: "Pune" }).every((l) => l.city === "Pune")).toBe(true);
    expect(
      filterListings(RE_LISTINGS, { locality: "Baner" }).every((l) => l.locality === "Baner"),
    ).toBe(true);
  });

  it("filters by pincode", () => {
    const result = filterListings(RE_LISTINGS, { pincode: "411045" });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((l) => l.pincode === "411045")).toBe(true);
  });

  it("combines multiple facets with AND semantics", () => {
    const result = filterListings(RE_LISTINGS, {
      city: "Hyderabad",
      categories: ["apartments"],
      bhk: [3],
    });
    expect(result.every((l) => l.city === "Hyderabad" && l.category === "apartments" && l.bhk === 3)).toBe(
      true,
    );
  });

  it("returns an empty array when no listing satisfies every facet", () => {
    const result = filterListings(RE_LISTINGS, { city: "Pune", bhk: [99] });
    expect(result).toHaveLength(0);
  });

  it("is pure: works over an arbitrary listings array, not just RE_LISTINGS", () => {
    const fixture: REListing[] = RE_LISTINGS.slice(0, 2);
    const result = filterListings(fixture, {});
    expect(result).toEqual(fixture);
  });
});

describe("sortListings()", () => {
  it("relevance (default) preserves input order", () => {
    const result = sortListings(RE_LISTINGS, "relevance");
    expect(result).toEqual(RE_LISTINGS);
  });

  it("price_asc sorts ascending by priceLakhs", () => {
    const result = sortListings(RE_LISTINGS, "price_asc");
    for (let i = 1; i < result.length; i++) {
      expect(result[i].priceLakhs).toBeGreaterThanOrEqual(result[i - 1].priceLakhs);
    }
  });

  it("price_desc sorts descending by priceLakhs", () => {
    const result = sortListings(RE_LISTINGS, "price_desc");
    for (let i = 1; i < result.length; i++) {
      expect(result[i].priceLakhs).toBeLessThanOrEqual(result[i - 1].priceLakhs);
    }
  });

  it("does not mutate the input array", () => {
    const before = [...RE_LISTINGS];
    sortListings(RE_LISTINGS, "price_asc");
    expect(RE_LISTINGS).toEqual(before);
  });
});

describe("hasActiveFilters() / countActiveFilters()", () => {
  it("is false/0 for an empty filter set", () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(countActiveFilters({})).toBe(0);
  });

  it("is true/1 for a single active facet", () => {
    expect(hasActiveFilters({ city: "Pune" })).toBe(true);
    expect(countActiveFilters({ city: "Pune" })).toBe(1);
  });

  it("ignores an empty array as inactive", () => {
    expect(hasActiveFilters({ bhk: [] })).toBe(false);
    expect(countActiveFilters({ bhk: [] })).toBe(0);
  });

  it("counts one per active facet, not per selected value within a facet", () => {
    expect(countActiveFilters({ bhk: [2, 3, 4], city: "Pune" })).toBe(2);
  });
});
