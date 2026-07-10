// Canonical site origin, used for metadataBase, canonical URLs, the sitemap, and
// JSON-LD. Override with NEXT_PUBLIC_SITE_URL in the environment; the fallback
// keeps builds and previews working before the production domain is wired.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.example.com"
).replace(/\/$/, "");

export const SITE_NAME = "Loans & Real Estate";
