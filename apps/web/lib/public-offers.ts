// Server-only client for the public offers strip on /loans and /real-estate
// (GET /api/v1/public/offers). Same division of labor as
// lib/public-banners.ts: this module returns the display PublicOffer shape
// and goes through the server-only serverFetchJson, so it must never be
// imported by a Client Component.
//
// No same-origin guard is needed here, unlike lib/public-banners.ts's
// isSameOriginPath: offers carry no href or deep_link, so there is nothing
// for a visitor to be redirected through.

import type { components } from "@contracts/generated/schema";

import { serverFetchJson } from "@/lib/api/server";
import { formatDiscount, type PublicOffer } from "@/lib/offers";

type Schemas = components["schemas"];

export function mapPublicOffer(raw: Schemas["PublicOfferRead"]): PublicOffer {
  return {
    id: raw.id,
    line: raw.business_line,
    title: raw.title,
    description: raw.description ?? undefined,
    discountLabel: formatDiscount(raw.discount_type, raw.discount_value),
    code: raw.code ?? undefined,
  };
}

// Never throws, never rejects, same contract as getHeroBanners() /
// getPublicListings(): the product pages must keep rendering when the fetch
// fails or the table is simply empty. Callers do not distinguish the two --
// a visitor cannot act on the difference.
export async function getPublicOffers(): Promise<PublicOffer[]> {
  const res = await serverFetchJson<Schemas["PublicOfferListResponse"]>(
    "/api/v1/public/offers",
    { revalidate: 300 },
  );
  if (!res.ok) return [];
  return res.data.offers.map(mapPublicOffer);
}
