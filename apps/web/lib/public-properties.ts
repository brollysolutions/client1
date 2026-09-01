// Server-only client for the public property catalog
// (GET /api/v1/public/properties). Separate from lib/properties-api.ts,
// which is the authenticated DASHBOARD client (REListing shape, goes through
// the client-side apiRequest wrapper) — this module returns the public
// PropertyListing shape and goes through the server-only serverFetchJson, so
// it must never be imported by a Client Component.

import type { components } from "@contracts/generated/schema";

import { isAllowedAssetUrl } from "@/lib/allowed-asset-url";
import { serverFetchJson } from "@/lib/api/server";
import type { ApiResponse } from "@/lib/api/client";
import type { PropertyDetailListing, PropertyListing } from "@/lib/properties";

type Schemas = components["schemas"];

export function mapPublicListing(raw: Schemas["PublicPropertyRead"]): PropertyListing {
  const media = (raw.media ?? []).filter((item) => isAllowedAssetUrl(item.url));
  return {
    id: raw.id,
    title: raw.title,
    location: raw.location,
    price: raw.price_display,
    type: raw.type,
    listingIntent: raw.listing_intent,
    category: raw.category,
    propertySubtype: raw.property_subtype ?? undefined,
    meta: raw.meta ?? undefined,
    image:
      media.find((item) => item.kind === "image")?.url ??
      raw.media_urls?.find(isAllowedAssetUrl) ??
      (raw.image?.startsWith("/") ? raw.image : undefined),
    media: media.length > 0 ? media : undefined,
    reraNumber: raw.rera_number,
    reraVerificationStatus: raw.rera_verification_status,
    ...(raw.structured_details ? { structuredDetails: raw.structured_details } : {}),
  };
}

// Never throws, never rejects: an ISR-fetched Server Component page must
// keep rendering its other sections (hero, journey, FAQ, CTA) even when the
// catalog fetch fails or the table is simply empty. Every failure path here
// collapses to an empty array; distinguishing "empty" from "failed" buys the
// visitor nothing actionable, so we don't.
export async function getPublicListings(): Promise<PropertyListing[]> {
  const res = await serverFetchJson<Schemas["PublicPropertyListResponse"]>(
    "/api/v1/public/properties",
    { revalidate: 300 },
  );
  if (!res.ok) return [];
  return res.data.properties.map(mapPublicListing);
}

export function mapPublicPropertyDetail(
  raw: Schemas["PublicPropertyDetailRead"],
): PropertyDetailListing {
  const base = mapPublicListing(raw);
  return {
    ...base,
    city: raw.city,
    locality: raw.locality,
    ...(raw.state ? { state: raw.state } : {}),
    pincode: raw.pincode,
    bhk: raw.bhk,
    areaSqft: raw.area_sqft,
    furnishing: raw.furnishing,
    constructionStatus: raw.construction_status,
    amenities: raw.amenities,
    ageYears: raw.age_years,
    reraApplicability: raw.rera_applicability,
    securityDepositDisplay: raw.security_deposit_display ?? null,
    minimumLeaseMonths: raw.minimum_lease_months,
    availableFrom: raw.available_from,
    listingLinks: raw.listing_links,
  };
}

export async function getPublicProperty(
  id: string,
): Promise<ApiResponse<PropertyDetailListing>> {
  const res = await serverFetchJson<Schemas["PublicPropertyDetailRead"]>(
    `/api/v1/public/properties/${encodeURIComponent(id)}`,
    // Detail visibility must reflect deactivation immediately even when a
    // visitor arrived from the five-minute curated catalogue cache.
    { revalidate: 0 },
  );
  if (!res.ok) return res;
  return {
    ok: true,
    status: res.status,
    data: mapPublicPropertyDetail(res.data),
  };
}
