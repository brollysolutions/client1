import { describe, expect, it } from "vitest";

import {
  matchCurrentLocationToPropertyFacet,
  type SuggestionIndex,
} from "@/lib/property-facets";

const suggestions: SuggestionIndex = {
  localities: ["Baner", "Kondapur"],
  cities: ["Hyderabad", "Pune"],
  pincodes: ["411045", "500084"],
  properties: [],
};

describe("matchCurrentLocationToPropertyFacet", () => {
  it("prefers an exact catalog locality and preserves its canonical spelling", () => {
    expect(
      matchCurrentLocationToPropertyFacet(
        {
          label: "kondapur, Hyderabad, Telangana",
          locality: "kondapur",
          city: "Hyderabad",
          subdivision: "Telangana",
          country: "India",
        },
        suggestions,
      ),
    ).toEqual({ kind: "locality", value: "Kondapur", city: "Hyderabad" });
  });

  it("falls back to an exact city, then a readable free-text query", () => {
    expect(
      matchCurrentLocationToPropertyFacet(
        {
          label: "Unknown area, Pune, Maharashtra",
          locality: "Unknown area",
          city: "pune",
          subdivision: "Maharashtra",
          country: "India",
        },
        suggestions,
      ),
    ).toEqual({ kind: "city", value: "Pune" });
    expect(
      matchCurrentLocationToPropertyFacet(
        {
          label: "Mysuru, Karnataka",
          locality: "Mysuru",
          city: null,
          subdivision: "Karnataka",
          country: "India",
        },
        suggestions,
      ),
    ).toEqual({ kind: "query", value: "Mysuru" });
  });
});
