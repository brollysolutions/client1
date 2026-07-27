// Display type + pure helpers for the public offers strip on /loans and
// /real-estate. Hand-written, not derived from the generated contract: two
// wire fields (discount_type + discount_value) collapse into one display
// field here, and business_line's "both" value is internal taxonomy a
// visitor should never see rendered as-is. The wire-shaped side stays
// contract-typed in lib/public-offers.ts, same division of labor as
// lib/banners.ts (display/pure) vs lib/public-banners.ts (fetch/map).

import { formatINR } from "@/lib/format";

export type OfferLine = "loans" | "real_estate";

export type PublicOffer = {
  id: string;
  // Raw wire business_line ("loans" | "real_estate" | "both"), kept as-is so
  // offersForLine can filter on it. Never rendered directly.
  line: string;
  title: string;
  description?: string;
  discountLabel?: string;
  code?: string;
};

// Product-level display cap, deliberately separate from the backend's
// PUBLIC_OFFERS_PER_LINE (8): that number is a transport/DoS bound, this one
// is how many cards a strip actually shows (two full rows of three at lg).
export const OFFER_STRIP_MAX = 6;

/**
 * Turns discount_type + discount_value into one human label, or undefined if
 * the value can't be trusted to render (empty, non-numeric, or negative --
 * the API's Field(ge=0) already forbids negative, this is defence in depth).
 *
 * cashback-tie is rendered in rupees, matching what the Sub Admin CMS already
 * shows the author (features/sub-admin/offers-view.tsx's discountText) --
 * the spec never states the unit, so this is an inference, not a fact, and
 * matching the CMS is the least surprising reading available.
 */
export function formatDiscount(
  discountType: string,
  discountValue: string,
): string | undefined {
  if (discountValue.trim() === "") return undefined;
  const value = Number(discountValue);
  if (!Number.isFinite(value) || value < 0) return undefined;

  switch (discountType) {
    case "percentage":
      return `${value}% off`;
    case "flat":
      return `${formatINR(value)} off`;
    case "cashback-tie":
      return value === 0 ? "Cashback offer" : `${formatINR(value)} cashback`;
    default:
      return undefined;
  }
}

/**
 * Positive allowlist, never `o.line !== otherLine`: a future fourth
 * business_line value must be invisible on both strips by default, same
 * argument list_public_banners makes for its banner_type allowlist.
 */
export function offersForLine(offers: PublicOffer[], line: OfferLine): PublicOffer[] {
  return offers.filter((o) => o.line === line || o.line === "both");
}
