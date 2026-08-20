import { describe, expect, it } from "vitest";

import {
  buildSuggestionIndex,
  matchCurrentLocationToPropertyFacet,
  type SuggestionIndex,
} from "@/lib/property-facets";
import type { REListing } from "@/lib/real-estate";

const suggestions: SuggestionIndex = {
  localities: ["Baner", "Kondapur"],
  cities: ["Hyderabad", "Pune"],
  pincodes: ["411045", "500084"],
  properties: [],
  priceBounds: { min: 10, max: 20 },
  areaBounds: { min: 100, max: 200 },
};

const apiListing = {
  id: "api-property",
  title: "API property",
  location: "Live locality, Live city",
  price: "₹75 L",
  type: "Apartment",
  category: "apartments",
  pincode: "123456",
  furnishing: "semi",
  status: "ready",
  amenities: [],
  ageYears: 1,
  city: "Live city",
  locality: "Live locality",
  bhk: 2,
  areaSqft: 1100,
  priceLakhs: 75,
} satisfies REListing;

describe("buildSuggestionIndex", () => {
  it("derives every location option and range from the supplied API listings", () => {
    expect(buildSuggestionIndex([apiListing])).toEqual({
      localities: ["Live locality"],
      cities: ["Live city"],
      pincodes: ["123456"],
      properties: [
        {
          id: "api-property",
          title: "API property",
          locality: "Live locality",
          city: "Live city",
        },
      ],
      priceBounds: { min: 0, max: 75 },
      areaBounds: { min: 0, max: 1100 },
    });
    expect(buildSuggestionIndex([])).toEqual({
      localities: [],
      cities: [],
      pincodes: [],
      properties: [],
      priceBounds: { min: 0, max: 500 },
      areaBounds: { min: 0, max: 5000 },
    });
  });
});

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
