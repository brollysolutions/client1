// Server-only client for the public homepage hero
// (GET /api/v1/public/banners). Same division of labor as
// lib/public-properties.ts: this module returns the display HeroBanner shape
// and goes through the server-only serverFetchJson, so it must never be
// imported by a Client Component.

import type { components } from "@contracts/generated/schema";

import { serverFetchJson } from "@/lib/api/server";
import type { HeroBanner } from "@/lib/banners";

type Schemas = components["schemas"];

// A single leading "/" not followed by another "/" or a backslash. Plain
// startsWith("/") is not enough: "//evil.com" also starts with "/" but
// browsers (and next/link, which treats a "//"-prefixed href as non-local and
// renders a plain anchor) resolve it as protocol-relative to an off-site
// origin, and "/\evil.com" normalizes the same way under WHATWG URL parsing.
// Both would otherwise sail through a naive same-origin check.
function isSameOriginPath(href: string): boolean {
  return /^\/(?![/\\])/.test(href);
}

export function mapPublicBanner(raw: Schemas["PublicBannerRead"]): HeroBanner {
  return {
    id: raw.id,
    title: raw.title,
    subtitle: raw.subtitle ?? undefined,
    // No public image field yet (public-banner-serving.md's Out of scope
    // section) -- the component's cream-placeholder branch handles this.
    image: undefined,
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
      raw.cta_label && raw.deep_link && isSameOriginPath(raw.deep_link)
        ? { label: raw.cta_label, href: raw.deep_link }
        : undefined,
  };
}

// Never throws, never rejects, same contract as getPublicListings(): the
// homepage must keep rendering when the fetch fails or the table is simply
// empty. Callers (app/(public)/page.tsx) fall back to FALLBACK_HERO_BANNERS
// on an empty array -- the two failure shapes are deliberately not
// distinguished here, since a visitor cannot act on the difference.
export async function getHeroBanners(): Promise<HeroBanner[]> {
  const res = await serverFetchJson<Schemas["PublicBannerListResponse"]>(
    "/api/v1/public/banners",
    { revalidate: 60 },
  );
  if (!res.ok) return [];
  return res.data.banners.map(mapPublicBanner);
}
