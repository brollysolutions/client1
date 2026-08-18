// Server-only client for public content blocks (GET /api/v1/public/content-blocks,
// GET /api/v1/public/content-blocks/{slug}). Same division of labor as
// lib/public-banners.ts: this module returns the
// display PublicContentBlock shape and goes through the server-only
// serverFetchJson, so it must never be imported by a Client Component.
//
// Callers look a specific block up by its unique slug (see
// content-block-section.tsx) -- getPublicContentBlockBySlug is the direct
// lookup for that case. getPublicContentBlocks (the full published set)
// stays exported for any future caller that genuinely needs a list.

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

// Never throws, never rejects, same contract as
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

// Never throws, never rejects -- same contract as getPublicContentBlocks().
// A 404 (no published block at this slug) and a failed fetch both collapse
// to null; ContentBlockSection renders nothing either way.
export async function getPublicContentBlockBySlug(
  slug: string,
): Promise<PublicContentBlock | null> {
  const res = await serverFetchJson<Schemas["PublicContentBlockRead"]>(
    `/api/v1/public/content-blocks/${encodeURIComponent(slug)}`,
    { revalidate: 300 },
  );
  if (!res.ok) return null;
  return mapPublicContentBlock(res.data);
}
