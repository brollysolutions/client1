// Placeholder real-estate catalog for the public Properties page
// (app/(public)/real-estate). No property backend exists yet, so the arrays
// below are hardcoded samples; later this becomes data fetched from
// /api/v1/properties and passed in as a prop, with no layout rework (same
// dynamic-ready pattern as the banners array in components/hero-carousel.tsx).
//
// Listing a property is an agent-side action, so clients only ever see buy/rent.
// Copy follows apps/web/CLAUDE.md content rules: humanized, `₹` never `$`, no
// em/en dashes.

export type PropertyDeal = "buy" | "rent";

export type PropertyListing = {
  id: string;
  title: string; // "2 BHK Apartment"
  location: string; // "Baner, Pune"
  /** Pre-formatted display price. "₹45 L" for buy, "₹22,000 / mo" for rent. */
  price: string;
  type: string; // "Apartment" | "Plot" | "Office" ...
  meta?: string; // "2 bed · 1,120 sqft"
  deal: PropertyDeal;
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
    deal: "buy",
  },
  {
    id: "b2",
    title: "Residential Plot",
    location: "Shankarpally, Hyderabad",
    price: "₹42 L",
    type: "Plot",
    meta: "200 sq yd",
    deal: "buy",
  },
  {
    id: "b3",
    title: "3 BHK Villa",
    location: "Whitefield, Bengaluru",
    price: "₹1.6 Cr",
    type: "Villa",
    meta: "3 bed · 2,400 sqft",
    deal: "buy",
  },
  {
    id: "b4",
    title: "Commercial Shop",
    location: "Kukatpally, Hyderabad",
    price: "₹95 L",
    type: "Commercial",
    meta: "650 sqft",
    deal: "buy",
  },
  {
    id: "b5",
    title: "1 BHK Apartment",
    location: "Wakad, Pune",
    price: "₹54 L",
    type: "Apartment",
    meta: "1 bed · 640 sqft",
    deal: "buy",
  },
  {
    id: "b6",
    title: "Farm Land",
    location: "Chevella, Telangana",
    price: "₹28 L",
    type: "Plot",
    meta: "1 acre",
    deal: "buy",
  },
];

export const RENT_LISTINGS: PropertyListing[] = [
  {
    id: "r1",
    title: "2 BHK Home",
    location: "Kothrud, Pune",
    price: "₹24,000 / mo",
    type: "Home",
    meta: "2 bed · 1,000 sqft",
    deal: "rent",
  },
  {
    id: "r2",
    title: "Single-room PG",
    location: "HSR Layout, Bengaluru",
    price: "₹9,500 / mo",
    type: "PG",
    meta: "Shared · meals included",
    deal: "rent",
  },
  {
    id: "r3",
    title: "Office Space",
    location: "Gachibowli, Hyderabad",
    price: "₹65,000 / mo",
    type: "Office",
    meta: "8 seats · 900 sqft",
    deal: "rent",
  },
  {
    id: "r4",
    title: "Retail Shop",
    location: "Viman Nagar, Pune",
    price: "₹40,000 / mo",
    type: "Shop",
    meta: "450 sqft",
    deal: "rent",
  },
  {
    id: "r5",
    title: "3 BHK Home",
    location: "Madhapur, Hyderabad",
    price: "₹38,000 / mo",
    type: "Home",
    meta: "3 bed · 1,650 sqft",
    deal: "rent",
  },
  {
    id: "r6",
    title: "Studio Apartment",
    location: "Indiranagar, Bengaluru",
    price: "₹19,000 / mo",
    type: "Home",
    meta: "1 room · 420 sqft",
    deal: "rent",
  },
];
