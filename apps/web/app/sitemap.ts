import type { MetadataRoute } from "next";

import { CALCULATOR_SLUGS } from "@/lib/calculators/registry";
import { financialServiceHref, LOAN_PRODUCTS } from "@/lib/products";
import { SITE_URL } from "@/lib/site";

// Public URLs for crawlers, including every permanent service overview and
// calculator. Provider publication controls remain on the detail routes.
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
  const servicePaths = LOAN_PRODUCTS.map((service) => financialServiceHref(service.id));
  return [...staticPaths, ...calculatorPaths, ...servicePaths].map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "monthly",
    priority: path === "" ? 1 : 0.7,
  }));
}
