import { describe, expect, it } from "vitest";

import {
  PROPERTY_SUBTYPE_GROUPS,
  PROPERTY_SUBTYPE_OPTIONS,
  propertySubtypeHref,
  propertySubtypeOption,
} from "@/lib/property-taxonomy";

describe("property subtype taxonomy", () => {
  it("keeps the requested 4/2/3 hierarchy and nine unique subtypes", () => {
    expect(PROPERTY_SUBTYPE_GROUPS.map((group) => group.heading)).toEqual([
      "Residential",
      "Plots",
      "Commercial",
    ]);
    expect(PROPERTY_SUBTYPE_GROUPS.map((group) => group.items.length)).toEqual([4, 3, 2]);
    const values = PROPERTY_SUBTYPE_OPTIONS.map((item) => item.value);
    expect(new Set(values).size).toBe(9);
  });

  it("maps subtype navigation to stable public URLs", () => {
    expect(propertySubtypeHref("gated_community_apartment")).toBe(
      "/real-estate?property_type=gated_community_apartment",
    );
    expect(propertySubtypeOption("gated_community_apartment")?.campaignKey).toBe(
      "gated-community-apartment",
    );
    expect(propertySubtypeOption("unknown")).toBeUndefined();
  });
});
