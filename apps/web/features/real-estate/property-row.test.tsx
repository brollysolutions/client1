import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PropertyRow } from "@/features/real-estate/property-row";

// The populated (has-listings) path renders PropertyCard, which needs
// RealEstateProvider (bookmark state) in the tree -- no existing test wraps
// that, so this file covers only the empty-state path below, which is both
// the actual behavior change here and provider-free.

describe("PropertyRow", () => {
  // Regression guard: this row used to return null outright for an empty
  // category, silently erasing it from Explore whenever its live count was
  // zero (the exact defect the now-removed CategoryStrip previously worked
  // around from outside). It must stay visible and reachable on its own.
  it("stays visible and reachable when there are no listings", () => {
    const markup = renderToStaticMarkup(
      <PropertyRow heading="Residential Houses" href="/dashboard/explore/houses" listings={[]} />,
    );
    expect(markup).toContain("Residential Houses");
    expect(markup).toContain("No listings yet");
    expect(markup).toContain("/dashboard/explore/houses");
  });

  it("omits the browse link when no href is given for an empty category", () => {
    const markup = renderToStaticMarkup(<PropertyRow heading="Commercial" listings={[]} />);
    expect(markup).toContain("No listings yet");
    expect(markup).not.toContain("<a");
  });
});
