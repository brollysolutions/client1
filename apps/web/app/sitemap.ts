import type { MetadataRoute } from "next";

import { CALCULATOR_SLUGS } from "@/lib/calculators/registry";
import { financialServiceHref } from "@/lib/products";
import { getPublishedServiceProducts } from "@/lib/financial-catalog";
import { SITE_URL } from "@/lib/site";

export const revalidate = 0;

// Only currently published services belong in the sitemap.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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
  const products = await getPublishedServiceProducts();
  const servicePaths = [...new Set(products.map((product) => financialServiceHref(product.slug)))];
  return [...staticPaths, ...calculatorPaths, ...servicePaths].map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "monthly",
    priority: path === "" ? 1 : 0.7,
  }));
}
