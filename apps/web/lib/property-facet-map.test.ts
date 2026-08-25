import { describe, expect, it } from "vitest";

import { categoryForSubtype, subtypeGroupsFor, visibleFacets } from "@/lib/property-facet-map";

describe("visibleFacets()", () => {
  it("offers every facet when nothing is selected", () => {
    expect([...visibleFacets()].sort()).toEqual([
      "amenities",
      "area",
      "bhk",
      "furnishing",
      "price",
      "status",
      "subtype",
    ]);
    expect(visibleFacets([], [])).toEqual(visibleFacets());
  });

  it("keeps every residential facet for houses, apartments, and villas", () => {
    for (const category of ["houses", "apartments", "villas"] as const) {
      const facets = visibleFacets([category]);
      expect(facets.has("bhk")).toBe(true);
      expect(facets.has("furnishing")).toBe(true);
      expect(facets.has("status")).toBe(true);
    }
  });

  it("drops bedrooms, furnishing, and construction status for plots", () => {
    const facets = visibleFacets(["plots"]);
    expect(facets.has("bhk")).toBe(false);
    expect(facets.has("furnishing")).toBe(false);
    expect(facets.has("status")).toBe(false);
    // Land is still bought on extent, price, and what the project provides.
    expect(facets.has("area")).toBe(true);
    expect(facets.has("price")).toBe(true);
    expect(facets.has("amenities")).toBe(true);
  });

  it("drops only bedrooms for commercial", () => {
    const facets = visibleFacets(["commercial"]);
    expect(facets.has("bhk")).toBe(false);
    expect(facets.has("furnishing")).toBe(true);
    expect(facets.has("status")).toBe(true);
  });

  it("unions facets across a multi-category selection rather than intersecting", () => {
    // Apartments support bedrooms and plots do not. Selecting both must keep
    // the facet available, or the user loses a constraint they can express.
    const facets = visibleFacets(["apartments", "plots"]);
    expect(facets.has("bhk")).toBe(true);
    expect(facets.has("furnishing")).toBe(true);
  });

  it("scopes facets through a subtype when no category is selected", () => {
    expect(visibleFacets(undefined, ["plot"]).has("bhk")).toBe(false);
    expect(visibleFacets(undefined, ["villa"]).has("bhk")).toBe(true);
    // A subtype widens the scope the same way an explicit category would.
    expect(visibleFacets(["plots"], ["villa"]).has("bhk")).toBe(true);
  });
});

describe("categoryForSubtype()", () => {
  it("maps each subtype onto its category", () => {
    expect(categoryForSubtype("individual_house")).toBe("houses");
    expect(categoryForSubtype("gated_community_apartment")).toBe("apartments");
    expect(categoryForSubtype("villa")).toBe("villas");
    expect(categoryForSubtype("farmland")).toBe("plots");
    expect(categoryForSubtype("unlocked_space")).toBe("commercial");
  });
});

describe("subtypeGroupsFor()", () => {
  it("returns every group when nothing narrows it", () => {
    expect(subtypeGroupsFor().map((group) => group.heading)).toEqual([
      "Residential",
      "Plots",
      "Commercial",
    ]);
  });

  it("omits subtypes that are the only one in their category", () => {
    // `villa` is the sole subtype of `villas` and `individual_house` the sole
    // subtype of `houses`. Offering them would put a second "Villas" control in
    // the panel returning a different count from the category toggle.
    const values = subtypeGroupsFor().flatMap((group) =>
      group.items.map((item) => item.value),
    );
    expect(values).not.toContain("villa");
    expect(values).not.toContain("individual_house");
    expect(values).toEqual([
      "standalone_apartment",
      "gated_community_apartment",
      "plot",
      "farmland",
      "agriland",
      "locked_space",
      "unlocked_space",
    ]);
  });

  it("keeps only the groups a selected category belongs to", () => {
    const groups = subtypeGroupsFor(["plots"]);
    expect(groups).toHaveLength(1);
    expect(groups[0].heading).toBe("Plots");
    expect(groups[0].items.map((item) => item.value)).toEqual(["plot", "farmland", "agriland"]);
  });

  it("offers nothing for a category its subtype does not subdivide", () => {
    expect(subtypeGroupsFor(["villas"])).toEqual([]);
    expect(subtypeGroupsFor(["houses"])).toEqual([]);
  });

  it("narrows to the subtypes actually present in the result ceiling", () => {
    const groups = subtypeGroupsFor(undefined, ["gated_community_apartment", "plot"]);
    expect(groups.map((group) => group.heading)).toEqual(["Residential", "Plots"]);
    expect(groups[0].items.map((item) => item.value)).toEqual(["gated_community_apartment"]);
    expect(groups[1].items.map((item) => item.value)).toEqual(["plot"]);
  });

  it("drops groups that end up empty instead of rendering a bare heading", () => {
    expect(subtypeGroupsFor(["commercial"], ["plot"])).toEqual([]);
    expect(subtypeGroupsFor(undefined, [])).toEqual([]);
  });
});
