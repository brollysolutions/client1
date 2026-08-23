import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SimilarPropertiesPanel } from "@/components/similar-properties-panel";
import type { SimilarPropertyCardData } from "@/components/similar-property-card";

const WITH_AREA: SimilarPropertyCardData = {
  id: "a",
  href: "/dashboard/properties/a",
  title: "Hilltop Villa",
  address: "Baner, Pune",
  proximity: "Same locality",
  price: "₹1.1 Cr",
  area: "1,800 sq ft",
  image: "http://localhost:9000/bucket/villa.jpg",
  type: "Villa",
};

const WITHOUT_AREA: SimilarPropertyCardData = {
  id: "b",
  href: "/real-estate/properties/b",
  title: "River Apartment",
  address: "Kothrud, Pune",
  price: "₹78 L",
  type: "Apartment",
};

describe("SimilarPropertiesPanel", () => {
  it("returns nothing for an empty item list", () => {
    const markup = renderToStaticMarkup(<SimilarPropertiesPanel items={[]} />);
    expect(markup).toBe("");
  });

  it("renders each item's href, the heading, and the CTA", () => {
    const markup = renderToStaticMarkup(
      <SimilarPropertiesPanel
        items={[WITH_AREA, WITHOUT_AREA]}
        cta={{ href: "/real-estate#villas", label: "See all properties" }}
      />,
    );
    expect(markup).toContain('id="similar-properties-heading"');
    expect(markup).toContain("Similar properties");
    expect(markup).toContain('href="/dashboard/properties/a"');
    expect(markup).toContain('href="/real-estate/properties/b"');
    expect(markup).toContain('href="/real-estate#villas"');
    expect(markup).toContain("See all properties");
    // Single-instance layout guard: the heading id must appear exactly once.
    expect(markup.split('id="similar-properties-heading"')).toHaveLength(2);
  });

  it("renders no image element and a placeholder when image is absent", () => {
    const markup = renderToStaticMarkup(<SimilarPropertiesPanel items={[WITHOUT_AREA]} />);
    expect(markup).not.toContain("<img");
  });

  it("renders an image element when image is present", () => {
    const markup = renderToStaticMarkup(<SimilarPropertiesPanel items={[WITH_AREA]} />);
    expect(markup).toContain("<img");
  });

  it("degrades to a single Price column when area is absent", () => {
    const markup = renderToStaticMarkup(<SimilarPropertiesPanel items={[WITHOUT_AREA]} />);
    expect(markup).toContain("Price");
    expect(markup).not.toContain("Area");
  });

  it("renders both Price and Area columns when area is present", () => {
    const markup = renderToStaticMarkup(<SimilarPropertiesPanel items={[WITH_AREA]} />);
    expect(markup).toContain("Price");
    expect(markup).toContain("Area");
  });
});
