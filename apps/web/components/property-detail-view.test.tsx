import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Link from "next/link";
import { describe, expect, it } from "vitest";

import { PropertyDetailView } from "@/components/property-detail-view";
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
    expect(markup).toContain("Property at a glance");
    expect(markup).toContain("1,800 sq ft");
    expect(markup).toContain("Club House");
    expect(markup).toContain("RERA registration: RERA/MH/1234");
    expect(markup).toContain('href="/contact"');
  });
});
