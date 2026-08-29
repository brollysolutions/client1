import type { MetadataRoute } from "next";

import { CALCULATOR_SLUGS } from "@/lib/calculators/registry";
import { SITE_URL } from "@/lib/site";

// Public URLs for crawlers. The calculator suite is generated from the registry
// so new calculators appear here automatically.
export default function sitemap(): MetadataRoute.Sitemap {
  const staticPaths = [
    "",
    "/loans",
    "/real-estate",
    "/calculators",
    "/earn-with-us",
    "/apply-as-agent",
    "/contact",
    "/privacy",
    "/terms",
    "/cookies",
  ];
  const calculatorPaths = CALCULATOR_SLUGS.map((slug) => `/calculators/${slug}`);
  return [...staticPaths, ...calculatorPaths].map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "monthly",
    priority: path === "" ? 1 : 0.7,
  }));
}
