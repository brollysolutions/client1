// Placeholder real-estate catalog for the public Properties page
// (app/(public)/real-estate). No property backend exists yet, so the array
// below is a hardcoded sample; later this becomes data fetched from
// /api/v1/properties and passed in as a prop, with no layout rework (same
// dynamic-ready pattern as the banners array in components/hero-carousel.tsx).
//
// Listing a property is an agent-side action, so clients only ever see buy.
// Copy follows apps/web/CLAUDE.md content rules: humanized, `₹` never `$`, no
// em/en dashes.

// Grouping key for the category rows. `type` below is the human display badge
// shown on the card; `category` is the machine key we group and filter on.
export type PropertyCategory = "apartments" | "villas" | "plots" | "commercial";

export type PropertyListing = {
  id: string;
  title: string; // "2 BHK Apartment"
  location: string; // "Baner, Pune"
  /** Pre-formatted display price. "₹45 L". */
  price: string;
  type: string; // display badge: "Apartment" | "Plot" | "Office" ...
  /** Category the listing is grouped under on the Properties page. */
  category: PropertyCategory;
  meta?: string; // "2 bed · 1,120 sqft"
  /** ERD image_key → resolved URL later; undefined ⇒ cream placeholder band. */
  image?: string;
};

// Ordered category metadata drives the stacked category rows on /real-estate.
// One PropertyRow per entry, in this order.
export const PROPERTY_CATEGORIES: {
  key: PropertyCategory;
  label: string;
  blurb: string;
}[] = [
  {
    key: "apartments",
    label: "Apartments",
    blurb: "Flats and apartment homes, ready to move or under construction.",
  },
  {
    key: "villas",
    label: "Villas",
    blurb: "Independent villas and houses that come with their own land.",
  },
  {
    key: "plots",
    label: "Plots and Land",
    blurb: "Residential plots and farm land to build on or hold for later.",
  },
  {
    key: "commercial",
    label: "Commercial",
    blurb: "Offices, shops, and commercial spaces for your business.",
  },
];

export const BUY_LISTINGS: PropertyListing[] = [
  // Apartments
  {
    id: "a1",
    title: "2 BHK Apartment",
    location: "Baner, Pune",
    price: "₹78 L",
    type: "Apartment",
    category: "apartments",
    meta: "2 bed · 1,120 sqft",
  },
  {
    id: "a2",
    title: "1 BHK Apartment",
    location: "Wakad, Pune",
    price: "₹54 L",
    type: "Apartment",
    category: "apartments",
    meta: "1 bed · 640 sqft",
  },
  {
    id: "a3",
    title: "3 BHK Apartment",
    location: "Gachibowli, Hyderabad",
    price: "₹1.2 Cr",
    type: "Apartment",
    category: "apartments",
    meta: "3 bed · 1,750 sqft",
  },
  {
    id: "a4",
    title: "2 BHK Apartment",
    location: "Hinjewadi, Pune",
    price: "₹66 L",
    type: "Apartment",
    category: "apartments",
    meta: "2 bed · 980 sqft",
  },
  // Villas
  {
    id: "v1",
    title: "3 BHK Villa",
    location: "Whitefield, Bengaluru",
    price: "₹1.6 Cr",
    type: "Villa",
    category: "villas",
    meta: "3 bed · 2,400 sqft",
  },
  {
    id: "v2",
    title: "4 BHK Villa",
    location: "Kompally, Hyderabad",
    price: "₹2.1 Cr",
    type: "Villa",
    category: "villas",
    meta: "4 bed · 3,200 sqft",
  },
  {
    id: "v3",
    title: "Independent House",
    location: "Kondapur, Hyderabad",
    price: "₹1.35 Cr",
    type: "House",
    category: "villas",
    meta: "3 bed · 2,100 sqft",
  },
  // Plots and Land
  {
    id: "p1",
    title: "Residential Plot",
    location: "Shankarpally, Hyderabad",
    price: "₹42 L",
    type: "Plot",
    category: "plots",
    meta: "200 sq yd",
  },
  {
    id: "p2",
    title: "Farm Land",
    location: "Chevella, Telangana",
    price: "₹28 L",
    type: "Land",
    category: "plots",
    meta: "1 acre",
  },
  {
    id: "p3",
    title: "Corner Plot",
    location: "Sarjapur, Bengaluru",
    price: "₹65 L",
    type: "Plot",
    category: "plots",
    meta: "300 sq yd",
  },
  {
    id: "p4",
    title: "Residential Plot",
    location: "Mokila, Hyderabad",
    price: "₹38 L",
    type: "Plot",
    category: "plots",
    meta: "167 sq yd",
  },
  // Commercial
  {
    id: "c1",
    title: "Commercial Shop",
    location: "Kukatpally, Hyderabad",
    price: "₹95 L",
    type: "Shop",
    category: "commercial",
    meta: "650 sqft",
  },
  {
    id: "c2",
    title: "Office Space",
    location: "Baner, Pune",
    price: "₹1.1 Cr",
    type: "Office",
    category: "commercial",
    meta: "1,200 sqft",
  },
  {
    id: "c3",
    title: "Retail Showroom",
    location: "Madhapur, Hyderabad",
    price: "₹1.8 Cr",
    type: "Showroom",
    category: "commercial",
    meta: "1,800 sqft",
  },
];

// Listings for one category, in array order. Buy-only, so no status filter.
export function getListingsByCategory(
  category: PropertyCategory,
): PropertyListing[] {
  return BUY_LISTINGS.filter((listing) => listing.category === category);
}
