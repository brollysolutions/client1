// Category metadata and grouping for the public Properties page
// (app/(public)/real-estate). Listings themselves come from
// /api/v1/public/properties (see lib/public-properties.ts) — this module only
// owns the category union, its display copy, and grouping over an already
// fetched listing array.
//
// Listing is restricted to real-estate Agents, Sub Admins, and Admins, so Clients only browse.
// Copy follows apps/web/CLAUDE.md content rules: humanized, `₹` never `$`, no
// em/en dashes.

import type { components } from "@contracts/generated/schema";

// Grouping key for the category rows. `type` on a listing is the human
// display badge shown on the card; `category` is the machine key we group and
// filter on. Derived from the contract (not hand-declared) so a category the
// backend adds later is a compile error here (a missing CATEGORY_COPY key),
// not a listing that silently never renders.
export type PropertyCategory = components["schemas"]["PublicPropertyRead"]["category"];
export type PropertySubtype = NonNullable<
  components["schemas"]["PublicPropertyRead"]["property_subtype"]
>;
export type PropertyMediaItem = components["schemas"]["PropertyMediaRead"];
export type PropertyStructuredDetails = components["schemas"]["PublicPropertyRead"]["structured_details"];

export type PropertyListing = {
  id: string;
  title: string; // "2 BHK Apartment"
  location: string;
  /** Pre-formatted display price. "₹45 L" for sale, "₹25,000/month" for rent. */
  price: string;
  /** Sale vs rent/lease. Drives the card badge and the browse filter. */
  listingIntent: components["schemas"]["ListingIntent"];
  type: string; // display badge: "Apartment" | "Plot" | "Office" ...
  /** Category the listing is grouped under on the Properties page. */
  category: PropertyCategory;
  /** Structured navigation and campaign subtype. Missing only on legacy listings. */
  propertySubtype?: PropertySubtype;
  meta?: string; // "2 bed · 1,120 sqft"
  /** Resolved image URL; undefined ⇒ cream placeholder band. */
  image?: string;
  /** Approved public images and equirectangular panoramas in display order. */
  media?: PropertyMediaItem[];
  /** RERA registration number, a statutory disclosure on the card. */
  reraNumber?: string | null;
  reraVerificationStatus?: components["schemas"]["ReraVerificationStatus"];
  structuredDetails?: PropertyStructuredDetails;
};

export type PropertyDetailListing = PropertyListing & {
  city: string;
  locality: string;
  state?: string;
  pincode: string;
  bhk: number;
  areaSqft: number;
  furnishing: components["schemas"]["Furnishing"] | null;
  constructionStatus: components["schemas"]["ConstructionStatus"] | null;
  amenities: string[];
  ageYears: number;
  reraApplicability: components["schemas"]["ReraApplicability"];
  /** Rent-only terms; all null on a sale listing. */
  securityDepositDisplay: string | null;
  minimumLeaseMonths: number | null;
  availableFrom: string | null;
  /** Author-supplied external links, already host-checked for rendering. */
  listingLinks: components["schemas"]["ListingLink"][] | null;
};

const CATEGORY_COPY: Record<PropertyCategory, { label: string; blurb: string }> = {
  apartments: {
    label: "Apartments",
    blurb: "Flats and apartment homes, ready to move or under construction.",
  },
  houses: {
    label: "Houses",
    blurb: "Independent houses with their own land and full ownership.",
  },
  villas: {
    label: "Villas",
    blurb: "Gated villas with shared amenities and managed upkeep.",
  },
  plots: {
    label: "Plots and Land",
    blurb: "Residential plots and farm land to build on or hold for later.",
  },
  commercial: {
    label: "Commercial",
    blurb: "Offices, shops, and commercial spaces for your business.",
  },
};

// Ordered category metadata drives the stacked category rows on /real-estate.
// One PropertyRow per entry, in this order.
export const PROPERTY_CATEGORIES: {
  key: PropertyCategory;
  label: string;
  blurb: string;
}[] = (["apartments", "houses", "villas", "plots", "commercial"] as const).map((key) => ({
  key,
  ...CATEGORY_COPY[key],
}));

// Partitions a fetched listing array by category, preserving each listing's
// relative order. A category absent from `listings` gets no entry (the caller
// filters PROPERTY_CATEGORIES down to populated ones).
export function groupByCategory(
  listings: PropertyListing[],
): Map<PropertyCategory, PropertyListing[]> {
  const grouped = new Map<PropertyCategory, PropertyListing[]>();
  for (const listing of listings) {
    const bucket = grouped.get(listing.category);
    if (bucket) {
      bucket.push(listing);
    } else {
      grouped.set(listing.category, [listing]);
    }
  }
  return grouped;
}
