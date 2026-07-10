// Placeholder real-estate catalog for the public Properties page
// (app/(public)/real-estate). No property backend exists yet, so the array
// below is a hardcoded sample; later this becomes data fetched from
// /api/v1/properties and passed in as a prop, with no layout rework (same
// dynamic-ready pattern as the banners array in components/hero-carousel.tsx).
//
// Listing a property is an agent-side action, so clients only ever see buy.
// Copy follows apps/web/CLAUDE.md content rules: humanized, `₹` never `$`, no
// em/en dashes.

export type PropertyListing = {
  id: string;
  title: string; // "2 BHK Apartment"
  location: string; // "Baner, Pune"
  /** Pre-formatted display price. "₹45 L". */
  price: string;
  type: string; // "Apartment" | "Plot" | "Office" ...
  meta?: string; // "2 bed · 1,120 sqft"
  /** ERD image_key → resolved URL later; undefined ⇒ cream placeholder band. */
  image?: string;
};

export const BUY_LISTINGS: PropertyListing[] = [
  {
    id: "b1",
    title: "2 BHK Apartment",
    location: "Baner, Pune",
    price: "₹78 L",
    type: "Apartment",
    meta: "2 bed · 1,120 sqft",
  },
  {
    id: "b2",
    title: "Residential Plot",
    location: "Shankarpally, Hyderabad",
    price: "₹42 L",
    type: "Plot",
    meta: "200 sq yd",
  },
  {
    id: "b3",
    title: "3 BHK Villa",
    location: "Whitefield, Bengaluru",
    price: "₹1.6 Cr",
    type: "Villa",
    meta: "3 bed · 2,400 sqft",
  },
  {
    id: "b4",
    title: "Commercial Shop",
    location: "Kukatpally, Hyderabad",
    price: "₹95 L",
    type: "Commercial",
    meta: "650 sqft",
  },
  {
    id: "b5",
    title: "1 BHK Apartment",
    location: "Wakad, Pune",
    price: "₹54 L",
    type: "Apartment",
    meta: "1 bed · 640 sqft",
  },
  {
    id: "b6",
    title: "Farm Land",
    location: "Chevella, Telangana",
    price: "₹28 L",
    type: "Plot",
    meta: "1 acre",
  },
];
