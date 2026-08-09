// Properties client for the authenticated real-estate dashboard.
//
// Calls /api/v1/properties through the typed fetch wrapper in lib/api/client.ts
// and maps the wire shape (PropertyRead) onto the REListing shape the existing
// client-side filter/sort engine already consumes (lib/real-estate.ts), so the
// engine, suggestions, and results grid keep working with zero change. The API
// stores the structured facet columns directly, so nothing is re-parsed from
// display strings here; priceLakhs derives from the exact integer price_paise.

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";
import type { REListing } from "@/lib/real-estate";

type Schemas = components["schemas"];

export function mapProperty(raw: Schemas["PropertyRead"]): REListing {
  return {
    id: raw.id,
    title: raw.title,
    location: raw.location,
    price: raw.price_display,
    type: raw.type,
    category: raw.category,
    meta: raw.meta ?? undefined,
    image: raw.media_urls?.[0] ?? raw.image ?? undefined,
    ...(raw.media?.length ? { media: raw.media } : {}),
    pincode: raw.pincode,
    furnishing: raw.furnishing,
    status: raw.construction_status,
    amenities: raw.amenities,
    ageYears: raw.age_years,
    city: raw.city,
    locality: raw.locality,
    bhk: raw.bhk,
    areaSqft: raw.area_sqft,
    priceLakhs: raw.price_paise / 10_000_000,
    reraNumber: raw.rera_number,
  };
}

export async function getProperties(): Promise<ApiResponse<REListing[]>> {
  const res = await apiRequest<Schemas["PropertyListResponse"]>("/api/v1/properties");
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.properties.map(mapProperty) };
}

export async function getProperty(id: string): Promise<ApiResponse<REListing>> {
  const res = await apiRequest<Schemas["PropertyRead"]>(`/api/v1/properties/${id}`);
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: mapProperty(res.data) };
}
