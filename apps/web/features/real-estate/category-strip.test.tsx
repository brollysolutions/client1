import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CategoryStrip } from "@/features/real-estate/category-strip";
import { RE_CATEGORIES, type REListing } from "@/lib/real-estate";

function listing(id: string, category: REListing["category"]): REListing {
  return {
    id,
    title: `Listing ${id}`,
    location: "Locality, City",
    price: "₹75 L",
    type: "Apartment",
    category,
    pincode: "123456",
    furnishing: "semi",
    status: "ready",
    amenities: [],
    ageYears: 1,
    city: "City",
    locality: "Locality",
    bhk: 2,
    areaSqft: 1100,
    priceLakhs: 75,
  };
}

describe("CategoryStrip", () => {
  it("links every published category, including ones with no listings", () => {
    const markup = renderToStaticMarkup(
      <CategoryStrip listings={[listing("a", "apartments")]} />,
    );

    for (const category of RE_CATEGORIES) {
      expect(markup).toContain(`/dashboard/explore/${category.key}`);
      expect(markup).toContain(category.label);
    }
  });

  it("counts listings per category and pluralises", () => {
    const markup = renderToStaticMarkup(
      <CategoryStrip
        listings={[
          listing("a", "apartments"),
          listing("b", "apartments"),
          listing("c", "villas"),
        ]}
      />,
    );

    expect(markup).toContain("2 properties");
    expect(markup).toContain("1 property");
  });

  it("marks empty categories as empty rather than dropping them", () => {
    // The carousels below the strip render nothing for a category with no
    // listings, so this is the only place houses and commercial stay reachable.
    const markup = renderToStaticMarkup(
      <CategoryStrip listings={[listing("a", "apartments")]} />,
    );

    expect(markup).toContain("No listings yet");
    expect(markup).toContain("/dashboard/explore/houses");
    expect(markup).toContain("/dashboard/explore/commercial");
  });
});
