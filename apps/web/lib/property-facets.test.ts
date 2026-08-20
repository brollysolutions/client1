import { describe, expect, it } from "vitest";

import { buildSuggestionIndex } from "@/lib/property-facets";
import type { REListing } from "@/lib/real-estate";

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
