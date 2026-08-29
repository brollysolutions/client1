import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PropertyCard } from "@/components/property-card";
import type { PropertyListing } from "@/lib/properties";

const LISTING: PropertyListing = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  title: "Lake View Villa",
  location: "Baner, Pune",
  price: "₹1.2 Cr",
  listingIntent: "sale",
  type: "Villa",
  category: "villas",
};

describe("public PropertyCard", () => {
  it("opens the full property page and preserves identity for contact", () => {
    const markup = renderToStaticMarkup(<PropertyCard listing={LISTING} />);
    expect(markup).toContain(
      "/real-estate/properties/123e4567-e89b-42d3-a456-426614174000",
    );
    expect(markup).toContain("property=123e4567-e89b-42d3-a456-426614174000");
    expect(markup).toContain("View property");
  });
});
