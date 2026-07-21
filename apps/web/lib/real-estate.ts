// Dashboard-scoped real-estate catalog. Mirrors lib/properties.ts (the public
// Properties page mock) but adds a "houses" category split out from villas, per
// the real-estate client dashboard design. Still frontend-only: no property
// backend exists yet, so this is a hardcoded sample; a future branch swaps this
// for /api/v1/properties once the real-estate RLS line-claim gap is fixed (see
// alembic/versions/2b3c4d5e6f7a_add_loan_applications.py).
import { Building2, Home, LandPlot, TreePine, Warehouse } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { PropertyListing as BaseListing } from "@/lib/properties";

export type RECategory = "houses" | "apartments" | "villas" | "plots" | "commercial";

export type REListing = Omit<BaseListing, "category"> & { category: RECategory };

export const RE_CATEGORIES: {
  key: RECategory;
  label: string;
  icon: LucideIcon;
  blurb: string;
}[] = [
  {
    key: "houses",
    label: "Residential Houses",
    icon: Home,
    blurb: "Independent houses and row houses on their own plot.",
  },
  {
    key: "apartments",
    label: "Apartments",
    icon: Building2,
    blurb: "Flats and apartment homes, ready to move or under construction.",
  },
  {
    key: "villas",
    label: "Villas",
    icon: TreePine,
    blurb: "Gated-community villas with private gardens and amenities.",
  },
  {
    key: "plots",
    label: "Plots and Land",
    icon: LandPlot,
    blurb: "Residential plots and farm land to build on or hold for later.",
  },
  {
    key: "commercial",
    label: "Commercial",
    icon: Warehouse,
    blurb: "Offices, shops, and commercial spaces for your business.",
  },
];

// Reuses lib/properties.ts imagery (villa-*.svg) for houses since no separate
// house illustrations exist yet.
export const RE_LISTINGS: REListing[] = [
  {
    id: "h1",
    title: "Independent House",
    location: "Kondapur, Hyderabad",
    price: "₹1.35 Cr",
    type: "House",
    category: "houses",
    meta: "3 bed · 2,100 sqft",
    image: "/illustrations/properties/villa-3.svg",
  },
  {
    id: "h2",
    title: "3 BHK Row House",
    location: "Bavdhan, Pune",
    price: "₹1.15 Cr",
    type: "House",
    category: "houses",
    meta: "3 bed · 1,900 sqft",
    image: "/illustrations/properties/villa-3.svg",
  },
  {
    id: "h3",
    title: "2 BHK Independent House",
    location: "Uppal, Hyderabad",
    price: "₹85 L",
    type: "House",
    category: "houses",
    meta: "2 bed · 1,400 sqft",
    image: "/illustrations/properties/villa-1.svg",
  },
  {
    id: "h4",
    title: "Duplex House",
    location: "Kharadi, Pune",
    price: "₹1.05 Cr",
    type: "House",
    category: "houses",
    meta: "3 bed · 2,000 sqft",
    image: "/illustrations/properties/villa-2.svg",
  },
  {
    id: "h5",
    title: "4 BHK Independent House",
    location: "JP Nagar, Bengaluru",
    price: "₹2.2 Cr",
    type: "House",
    category: "houses",
    meta: "4 bed · 3,000 sqft",
    image: "/illustrations/properties/villa-1.svg",
  },
  {
    id: "h6",
    title: "Row House",
    location: "Kompally, Hyderabad",
    price: "₹92 L",
    type: "House",
    category: "houses",
    meta: "3 bed · 1,750 sqft",
    image: "/illustrations/properties/villa-2.svg",
  },
  {
    id: "a1",
    title: "2 BHK Apartment",
    location: "Baner, Pune",
    price: "₹78 L",
    type: "Apartment",
    category: "apartments",
    meta: "2 bed · 1,120 sqft",
    image: "/illustrations/properties/apartment-1.svg",
  },
  {
    id: "a2",
    title: "1 BHK Apartment",
    location: "Wakad, Pune",
    price: "₹54 L",
    type: "Apartment",
    category: "apartments",
    meta: "1 bed · 640 sqft",
    image: "/illustrations/properties/apartment-2.svg",
  },
  {
    id: "a3",
    title: "3 BHK Apartment",
    location: "Gachibowli, Hyderabad",
    price: "₹1.2 Cr",
    type: "Apartment",
    category: "apartments",
    meta: "3 bed · 1,750 sqft",
    image: "/illustrations/properties/apartment-3.svg",
  },
  {
    id: "a4",
    title: "2 BHK Apartment",
    location: "Hinjewadi, Pune",
    price: "₹66 L",
    type: "Apartment",
    category: "apartments",
    meta: "2 bed · 980 sqft",
    image: "/illustrations/properties/apartment-1.svg",
  },
  {
    id: "a5",
    title: "3 BHK Apartment",
    location: "Miyapur, Hyderabad",
    price: "₹92 L",
    type: "Apartment",
    category: "apartments",
    meta: "3 bed · 1,450 sqft",
    image: "/illustrations/properties/apartment-2.svg",
  },
  {
    id: "a6",
    title: "2 BHK Apartment",
    location: "Electronic City, Bengaluru",
    price: "₹58 L",
    type: "Apartment",
    category: "apartments",
    meta: "2 bed · 1,050 sqft",
    image: "/illustrations/properties/apartment-3.svg",
  },
  {
    id: "v1",
    title: "3 BHK Villa",
    location: "Whitefield, Bengaluru",
    price: "₹1.6 Cr",
    type: "Villa",
    category: "villas",
    meta: "3 bed · 2,400 sqft",
    image: "/illustrations/properties/villa-1.svg",
  },
  {
    id: "v2",
    title: "4 BHK Villa",
    location: "Kompally, Hyderabad",
    price: "₹2.1 Cr",
    type: "Villa",
    category: "villas",
    meta: "4 bed · 3,200 sqft",
    image: "/illustrations/properties/villa-2.svg",
  },
  {
    id: "v4",
    title: "3 BHK Villa",
    location: "Tellapur, Hyderabad",
    price: "₹1.8 Cr",
    type: "Villa",
    category: "villas",
    meta: "3 bed · 2,650 sqft",
    image: "/illustrations/properties/villa-1.svg",
  },
  {
    id: "v5",
    title: "4 BHK Villa",
    location: "Sarjapur Road, Bengaluru",
    price: "₹2.4 Cr",
    type: "Villa",
    category: "villas",
    meta: "4 bed · 3,500 sqft",
    image: "/illustrations/properties/villa-2.svg",
  },
  {
    id: "p1",
    title: "Residential Plot",
    location: "Shankarpally, Hyderabad",
    price: "₹42 L",
    type: "Plot",
    category: "plots",
    meta: "200 sq yd",
    image: "/illustrations/properties/plot-1.svg",
  },
  {
    id: "p2",
    title: "Farm Land",
    location: "Chevella, Telangana",
    price: "₹28 L",
    type: "Land",
    category: "plots",
    meta: "1 acre",
    image: "/illustrations/properties/plot-2.svg",
  },
  {
    id: "p3",
    title: "Corner Plot",
    location: "Sarjapur, Bengaluru",
    price: "₹65 L",
    type: "Plot",
    category: "plots",
    meta: "300 sq yd",
    image: "/illustrations/properties/plot-3.svg",
  },
  {
    id: "p4",
    title: "Residential Plot",
    location: "Mokila, Hyderabad",
    price: "₹38 L",
    type: "Plot",
    category: "plots",
    meta: "167 sq yd",
    image: "/illustrations/properties/plot-1.svg",
  },
  {
    id: "p5",
    title: "Gated Community Plot",
    location: "Maheshwaram, Hyderabad",
    price: "₹52 L",
    type: "Plot",
    category: "plots",
    meta: "267 sq yd",
    image: "/illustrations/properties/plot-2.svg",
  },
  {
    id: "p6",
    title: "Residential Plot",
    location: "Devanahalli, Bengaluru",
    price: "₹48 L",
    type: "Plot",
    category: "plots",
    meta: "150 sq yd",
    image: "/illustrations/properties/plot-3.svg",
  },
  {
    id: "c1",
    title: "Commercial Shop",
    location: "Kukatpally, Hyderabad",
    price: "₹95 L",
    type: "Shop",
    category: "commercial",
    meta: "650 sqft",
    image: "/illustrations/properties/commercial-1.svg",
  },
  {
    id: "c2",
    title: "Office Space",
    location: "Baner, Pune",
    price: "₹1.1 Cr",
    type: "Office",
    category: "commercial",
    meta: "1,200 sqft",
    image: "/illustrations/properties/commercial-2.svg",
  },
  {
    id: "c3",
    title: "Retail Showroom",
    location: "Madhapur, Hyderabad",
    price: "₹1.8 Cr",
    type: "Showroom",
    category: "commercial",
    meta: "1,800 sqft",
    image: "/illustrations/properties/commercial-3.svg",
  },
  {
    id: "c4",
    title: "Office Space",
    location: "HITEC City, Hyderabad",
    price: "₹2.6 Cr",
    type: "Office",
    category: "commercial",
    meta: "2,400 sqft",
    image: "/illustrations/properties/commercial-1.svg",
  },
  {
    id: "c5",
    title: "Commercial Shop",
    location: "Viman Nagar, Pune",
    price: "₹85 L",
    type: "Shop",
    category: "commercial",
    meta: "520 sqft",
    image: "/illustrations/properties/commercial-2.svg",
  },
  {
    id: "c6",
    title: "Warehouse Unit",
    location: "Medchal, Hyderabad",
    price: "₹1.4 Cr",
    type: "Warehouse",
    category: "commercial",
    meta: "4,000 sqft",
    image: "/illustrations/properties/commercial-3.svg",
  },
];

export function getListingsByCategory(category: RECategory): REListing[] {
  return RE_LISTINGS.filter((listing) => listing.category === category);
}

export function getListingById(id: string): REListing | undefined {
  return RE_LISTINGS.find((listing) => listing.id === id);
}

export function getRECategory(key: string): (typeof RE_CATEGORIES)[number] | undefined {
  return RE_CATEGORIES.find((c) => c.key === key);
}

// Unique display locations, in first-seen order, for the search bar's location select.
export const LOCATIONS: string[] = Array.from(
  new Set(RE_LISTINGS.map((l) => l.location)),
);

// Parses a display price like "₹78 L" or "₹1.2 Cr" into a lakh-denominated
// number so the search bar can filter by budget without a real numeric field
// on the mock listing.
export function priceInLakhs(display: string): number {
  const match = display.match(/₹([\d.]+)\s*(L|Cr)/i);
  if (!match) return 0;
  const value = Number.parseFloat(match[1]);
  return match[2].toLowerCase() === "cr" ? value * 100 : value;
}

export type PropertyFilters = {
  location?: string;
  category?: RECategory;
  q?: string;
  maxLakhs?: number;
};

export function filterListings(filters: PropertyFilters): REListing[] {
  const q = filters.q?.trim().toLowerCase();
  return RE_LISTINGS.filter((listing) => {
    if (filters.location && listing.location !== filters.location) return false;
    if (filters.category && listing.category !== filters.category) return false;
    if (filters.maxLakhs && priceInLakhs(listing.price) > filters.maxLakhs) return false;
    if (q) {
      const haystack = `${listing.title} ${listing.location} ${listing.type}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export function hasActiveFilters(filters: PropertyFilters): boolean {
  return Boolean(filters.location || filters.category || filters.q || filters.maxLakhs);
}
