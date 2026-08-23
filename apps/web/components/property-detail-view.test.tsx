import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Link from "next/link";
import { describe, expect, it } from "vitest";

import { PropertyDetailView } from "@/components/property-detail-view";
import type { SimilarPropertyCardData } from "@/components/similar-properties-panel";
import type { PropertyDetailListing } from "@/lib/properties";

const DETAIL: PropertyDetailListing = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  title: "Lake View Villa",
  location: "Baner, Pune",
  price: "₹1.2 Cr",
  type: "Villa",
  category: "villas",
  city: "Pune",
  locality: "Baner",
  state: "Maharashtra",
  pincode: "411045",
  bhk: 3,
  areaSqft: 1800,
  furnishing: "furnished",
  constructionStatus: "ready",
  amenities: ["club_house", "gym"],
  ageYears: 2,
  reraApplicability: "applicable",
  reraNumber: "RERA/MH/1234",
  reraVerificationStatus: "verified",
};

const SIMILAR: SimilarPropertyCardData[] = [
  {
    id: "hilltop-villa",
    href: "/real-estate/properties/hilltop-villa",
    title: "Hilltop Villa",
    address: "Baner, Pune",
    proximity: "Same locality",
    price: "₹1.1 Cr",
    type: "Villa",
  },
];

describe("PropertyDetailView", () => {
  it("renders the complete buyer hierarchy and supplied action", () => {
    const markup = renderToStaticMarkup(
      <PropertyDetailView
        listing={DETAIL}
        backHref="/real-estate"
        backLabel="Back to properties"
        actions={<Link href="/contact">Contact team</Link>}
      />,
    );
    expect(markup).toContain("Lake View Villa");
    expect(markup).toContain("Overview");
    expect(markup).toContain("1,800 sq ft");
    expect(markup).toContain("Club House");
    expect(markup).toContain("RERA verified · RERA/MH/1234");
    expect(markup).toContain('href="/contact"');
  });

  it("drops the property-type badge and the Listing checks box", () => {
    const markup = renderToStaticMarkup(
      <PropertyDetailView
        listing={DETAIL}
        backHref="/real-estate"
        backLabel="Back to properties"
        actions={<Link href="/contact">Contact team</Link>}
      />,
    );
    // "Villa" still legitimately appears in the title/heading text, so assert
    // on the removed section/copy directly rather than the bare word.
    expect(markup).not.toContain("Listing checks");
    expect(markup).not.toContain("Admin-approved facts");
    expect(markup).not.toContain("This property is visible because a Dhanadhara Admin approved");
  });

  it("omits the similar-properties section when similar is absent or empty", () => {
    const withoutProp = renderToStaticMarkup(
      <PropertyDetailView
        listing={DETAIL}
        backHref="/real-estate"
        backLabel="Back to properties"
        actions={<Link href="/contact">Contact team</Link>}
      />,
    );
    const withEmpty = renderToStaticMarkup(
      <PropertyDetailView
        listing={DETAIL}
        backHref="/real-estate"
        backLabel="Back to properties"
        actions={<Link href="/contact">Contact team</Link>}
        similar={[]}
      />,
    );
    expect(withoutProp).not.toContain("Similar properties");
    expect(withEmpty).not.toContain("Similar properties");
  });

  it("renders the similar-properties panel, its cards, and the CTA when supplied", () => {
    const markup = renderToStaticMarkup(
      <PropertyDetailView
        listing={DETAIL}
        backHref="/real-estate"
        backLabel="Back to properties"
        actions={<Link href="/contact">Contact team</Link>}
        similar={SIMILAR}
        similarCta={{ href: "/real-estate?property_type=villa", label: "See more villas" }}
      />,
    );
    expect(markup).toContain("Similar properties");
    expect(markup).toContain('href="/real-estate/properties/hilltop-villa"');
    expect(markup).toContain('href="/real-estate?property_type=villa"');
    expect(markup).toContain("See more villas");
    // Single-instance layout guard: the rail must render exactly once even
    // though the mobile/desktop CSS repurposes the same wrapper via
    // `display: contents`, not a duplicated tree.
    expect(markup.split('id="similar-properties-heading"')).toHaveLength(2);
    // The pre-existing actions slot must still work after the rail restructure.
    expect(markup).toContain('href="/contact"');
  });
});
