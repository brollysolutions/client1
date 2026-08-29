/**
 * External listing links — the client mirror of `app/schemas/listing_links.py`.
 *
 * The server is the authority: it re-derives the platform and re-checks the
 * host on every write, and rejects anything off the allowlist. This module
 * exists so the author sees the platform resolve as they type instead of
 * discovering a rejection on submit, and so the render path can re-check a
 * stored link before turning it into an anchor.
 *
 * Re-checking at render matters: a link stored before the allowlist changed
 * must not keep rendering as a trusted platform badge. Never render a stored
 * `platform` field directly — always resolve it from the URL first.
 *
 * Keep the host table in sync with the Python one. A host here that the server
 * rejects only produces a confusing late error; a host here that the server
 * does not have is worse, because the form would invite a link that cannot be
 * saved.
 */

import type { components } from "@contracts/generated/schema";

type Schemas = components["schemas"];
export type ListingLink = Schemas["ListingLink"];
export type ListingLinkPlatform = Schemas["ListingLinkPlatform"];

export const MAX_LISTING_LINKS = 4;

/**
 * Exact-match host allowlist. Matching is equality, never a suffix test:
 * "youtube.com.evil.example" ends with nothing trusted but would slip past a
 * naive `endsWith`.
 */
const LISTING_LINK_HOSTS: Readonly<Record<string, ListingLinkPlatform>> = {
  "youtube.com": "youtube",
  "www.youtube.com": "youtube",
  "m.youtube.com": "youtube",
  "youtu.be": "youtube",
  "instagram.com": "instagram",
  "www.instagram.com": "instagram",
  "facebook.com": "facebook",
  "www.facebook.com": "facebook",
  "m.facebook.com": "facebook",
  "fb.watch": "facebook",
};

export const LISTING_LINK_PLATFORM_LABELS: Readonly<Record<ListingLinkPlatform, string>> = {
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
};

export const LISTING_LINK_HOST_HINT = "YouTube, Instagram, or Facebook";

/** Resolve an allowlisted platform from a URL, or null when it is not allowed. */
export function resolveListingLinkPlatform(url: string): ListingLinkPlatform | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
  // `URL` lowercases the hostname; strip a trailing root dot, which resolves
  // identically but would miss an equality match.
  const hostname = parsed.hostname.replace(/\.$/, "");
  return LISTING_LINK_HOSTS[hostname] ?? null;
}

/** Validation message for one authored link row, or undefined when it is fine. */
export function listingLinkError(value: string): string | undefined {
  if (!value.trim()) return undefined;
  return resolveListingLinkPlatform(value) === null
    ? `Use an HTTPS link to ${LISTING_LINK_HOST_HINT}.`
    : undefined;
}

/**
 * Stored links that are still safe to render, each paired with its freshly
 * resolved platform. Anything that no longer resolves is dropped rather than
 * rendered with a stale badge.
 */
export function renderableListingLinks(
  links: ListingLink[] | null | undefined,
): { url: string; platform: ListingLinkPlatform }[] {
  if (!links) return [];
  const safe: { url: string; platform: ListingLinkPlatform }[] = [];
  for (const link of links) {
    const platform = resolveListingLinkPlatform(link.url);
    if (platform) safe.push({ url: link.url, platform });
  }
  return safe.slice(0, MAX_LISTING_LINKS);
}
