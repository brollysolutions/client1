// Server-only client for public content blocks (GET /api/v1/public/content-blocks).
// Same division of labor as lib/public-offers.ts / lib/public-banners.ts: this
// module returns the display PublicContentBlock shape and goes through the
// server-only serverFetchJson, so it must never be imported by a Client
// Component.
//
// Callers look a specific block up by its unique slug (see
// content-block-section.tsx::findContentBlock), not by list position -- there
// is no per-line strip like offers, so this returns the full published set
// and lets the caller pick.

import type { components } from "@contracts/generated/schema";

import { serverFetchJson } from "@/lib/api/server";

type Schemas = components["schemas"];

export interface PublicContentBlock {
  slug: string;
  section: string;
  title: string;
  body: string | null;
  businessLine: string | null;
}

export function mapPublicContentBlock(
  raw: Schemas["PublicContentBlockRead"],
): PublicContentBlock {
  return {
    slug: raw.slug,
    section: raw.section,
    title: raw.title,
    body: raw.body,
    businessLine: raw.business_line,
  };
}

// Never throws, never rejects, same contract as getPublicOffers() /
// getHeroBanners(): pages must keep rendering when the fetch fails or the
// table is simply empty. Callers do not distinguish the two.
export async function getPublicContentBlocks(): Promise<PublicContentBlock[]> {
  const res = await serverFetchJson<Schemas["PublicContentBlockListResponse"]>(
    "/api/v1/public/content-blocks",
    { revalidate: 300 },
  );
  if (!res.ok) return [];
  return res.data.content_blocks.map(mapPublicContentBlock);
}
