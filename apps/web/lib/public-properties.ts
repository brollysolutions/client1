// Server-only client for the public property catalog
// (GET /api/v1/public/properties). Separate from lib/properties-api.ts,
// which is the authenticated DASHBOARD client (REListing shape, goes through
// the client-side apiRequest wrapper) — this module returns the public
// PropertyListing shape and goes through the server-only serverFetchJson, so
// it must never be imported by a Client Component.

import type { components } from "@contracts/generated/schema";

import { serverFetchJson } from "@/lib/api/server";
import { isAllowedAssetUrl } from "@/lib/public-banners";
import type { PropertyListing } from "@/lib/properties";

type Schemas = components["schemas"];

export function mapPublicListing(raw: Schemas["PublicPropertyRead"]): PropertyListing {
  return {
    id: raw.id,
    title: raw.title,
    location: raw.location,
    price: raw.price_display,
    type: raw.type,
    category: raw.category,
    meta: raw.meta ?? undefined,
    image:
      raw.media_urls?.find(isAllowedAssetUrl) ??
      (raw.image?.startsWith("/") ? raw.image : undefined),
    reraNumber: raw.rera_number,
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
