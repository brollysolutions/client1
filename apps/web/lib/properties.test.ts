import { describe, expect, it } from "vitest";

import { groupByCategory, PROPERTY_CATEGORIES, type PropertyListing } from "@/lib/properties";

// Em/en dash check enforces the content rule in apps/web/CLAUDE.md: user-facing
// copy must never join clauses with — or –.
const DASH_PATTERN = /[–—]/;

describe("PROPERTY_CATEGORIES integrity", () => {
  it("has no duplicate category keys", () => {
    const keys = PROPERTY_CATEGORIES.map((category) => category.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every category has non-empty label and blurb copy", () => {
    for (const category of PROPERTY_CATEGORIES) {
      expect(category.label.trim().length).toBeGreaterThan(0);
      expect(category.blurb.trim().length).toBeGreaterThan(0);
    }
  });

  it("no category copy uses an em or en dash", () => {
    for (const category of PROPERTY_CATEGORIES) {
      expect(category.label).not.toMatch(DASH_PATTERN);
      expect(category.blurb).not.toMatch(DASH_PATTERN);
    }
  });
});

function makeListing(overrides: Partial<PropertyListing> & Pick<PropertyListing, "id" | "category">): PropertyListing {
  return {
    listingIntent: "sale",
    title: "Test Listing",
    location: "Test City",
    price: "₹50 L",
    type: "Apartment",
    ...overrides,
  };
}

describe("groupByCategory()", () => {
  it("partitions listings with nothing lost or duplicated", () => {
    const listings = [
      makeListing({ id: "1", category: "apartments" }),
      makeListing({ id: "2", category: "villas" }),
      makeListing({ id: "3", category: "apartments" }),
    ];

    const grouped = groupByCategory(listings);
    const total = [...grouped.values()].reduce((sum, bucket) => sum + bucket.length, 0);

    expect(total).toBe(listings.length);
    expect(grouped.get("apartments")?.map((l) => l.id)).toEqual(["1", "3"]);
    expect(grouped.get("villas")?.map((l) => l.id)).toEqual(["2"]);
  });

  it("preserves input order within a group", () => {
    const listings = [
      makeListing({ id: "a", category: "plots" }),
      makeListing({ id: "b", category: "plots" }),
      makeListing({ id: "c", category: "plots" }),
    ];

    const grouped = groupByCategory(listings);
    expect(grouped.get("plots")?.map((l) => l.id)).toEqual(["a", "b", "c"]);
  });

  it("has no entry for a category absent from the input", () => {
    const grouped = groupByCategory([makeListing({ id: "1", category: "houses" })]);
    expect(grouped.has("commercial")).toBe(false);
  });

  it("returns an empty map for an empty input", () => {
    expect(groupByCategory([]).size).toBe(0);
  });
});
