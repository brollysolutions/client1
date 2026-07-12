import { describe, expect, it } from "vitest";

import {
  BUY_LISTINGS,
  getListingsByCategory,
  PROPERTY_CATEGORIES,
  type PropertyCategory,
} from "@/lib/properties";

describe("getListingsByCategory()", () => {
  it("returns only listings for the requested category", () => {
    const villas = getListingsByCategory("villas");
    expect(villas.length).toBeGreaterThan(0);
    expect(villas.every((listing) => listing.category === "villas")).toBe(true);
  });

  it("partitions the catalog with no listing lost or duplicated", () => {
    const grouped = PROPERTY_CATEGORIES.flatMap((category) =>
      getListingsByCategory(category.key),
    );
    expect(grouped).toHaveLength(BUY_LISTINGS.length);
  });
});

describe("PROPERTY_CATEGORIES integrity", () => {
  it("every declared category has at least one listing to render", () => {
    for (const category of PROPERTY_CATEGORIES) {
      expect(getListingsByCategory(category.key).length).toBeGreaterThan(0);
    }
  });

  it("every listing's category is a declared category (no orphans)", () => {
    const known = new Set<PropertyCategory>(
      PROPERTY_CATEGORIES.map((category) => category.key),
    );
    expect(BUY_LISTINGS.every((listing) => known.has(listing.category))).toBe(
      true,
    );
  });
});
