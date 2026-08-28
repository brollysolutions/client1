// Server-only client for the three public campaign placements
// (GET /api/v1/public/banners). Same division of labor as
// lib/public-properties.ts: this module returns the display HeroBanner shape
// and goes through the server-only serverFetchJson, so it must never be
// imported by a Client Component.

import type { components } from "@contracts/generated/schema";

import { isAllowedAssetUrl } from "@/lib/allowed-asset-url";
import { serverFetchJson } from "@/lib/api/server";
import type { HeroBanner } from "@/lib/banners";
import { isSafeLocalHref } from "@/lib/safe-local-href";

type Schemas = components["schemas"];

// A single leading "/" not followed by another "/" or a backslash. Plain
// startsWith("/") is not enough: "//evil.com" also starts with "/" but
// browsers (and next/link, which treats a "//"-prefixed href as non-local and
// renders a plain anchor) resolve it as protocol-relative to an off-site
// origin, and "/\evil.com" normalizes the same way under WHATWG URL parsing.
// Both would otherwise sail through a naive same-origin check.
// Mirrors next.config.ts's remotePatterns allowlist -- a host outside it
// makes next/image throw at RENDER time (not a graceful broken-image icon),
// which would take the whole homepage down. This guard is what stops that:
// image_url is server-computed and should already be one of these two
// hosts, but "should" isn't a load-bearing guarantee for an origin crash, so
// it's re-checked here rather than trusted blindly.
export { isAllowedAssetUrl } from "@/lib/allowed-asset-url";

export function mapPublicBanner(raw: Schemas["PublicBannerRead"]): HeroBanner {
  return {
    id: raw.id,
    title: raw.title,
    subtitle: raw.subtitle ?? undefined,
    // The component's cream-placeholder branch handles undefined -- kept
    // for a banner with no image, or one whose image_url somehow isn't on
    // an allowed host (shouldn't happen post write-validator; see the guard
    // above and services/storage.py::public_asset_url).
    image: raw.image_url && isAllowedAssetUrl(raw.image_url) ? raw.image_url : undefined,
    reraVerified: raw.rera_verified || undefined,
    // A CTA needs both a label and a same-origin destination. deep_link is
    // free-text CMS copy that reaches next/link unescaped; an absolute or
    // protocol-relative off-site URL is an open-redirect-shaped surface on a
    // financial site, so anything that isn't a genuine same-origin path is
    // dropped rather than trusted. This is the deep_link analogue of
    // lib/public-properties.ts's image?.startsWith("/") guard (that one has
    // the same protocol-relative gap -- out of scope for this PR, tracked
    // separately). Without both fields the title/subtitle still render, just
    // without a button.
    cta:
      raw.cta_label && raw.deep_link && isSafeLocalHref(raw.deep_link)
        ? { label: raw.cta_label, href: raw.deep_link }
        : undefined,
  };
}

// Never throws, never rejects, same contract as getPublicListings(): the
// homepage must keep rendering when the fetch fails or the table is simply
// empty. The hero caller (app/(public)/page.tsx) falls back to
// FALLBACK_HERO_BANNERS on an empty array; the ad strip deliberately does not,
// because an empty ad slot must vanish rather than show placeholder inventory.
// The two failure shapes are not distinguished here, since a visitor cannot
// act on the difference.
//
// Derived from the generated contract rather than hand-written, so it cannot
// drift from the router's Literal. "dashboard" is excluded for the same reason
// the API excludes it: that placement carries authenticated, audience-targeted
// content and is not anonymously reachable.
export type PublicBannerPlacement = Exclude<Schemas["BannerPlacement"], "dashboard">;

export async function getHeroBanners(
  placement: PublicBannerPlacement = "homepage",
): Promise<HeroBanner[]> {
  const res = await serverFetchJson<Schemas["PublicBannerListResponse"]>(
    `/api/v1/public/banners?placement=${encodeURIComponent(placement)}`,
    { revalidate: 60 },
  );
  if (!res.ok) return [];
  return res.data.banners.map(mapPublicBanner);
}
