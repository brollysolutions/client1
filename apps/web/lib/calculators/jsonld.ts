import { SITE_NAME, SITE_URL } from "@/lib/site";
import type { CalculatorDef } from "./types";

// Structured data for a calculator page: one @graph carrying the tool itself
// (WebApplication), the breadcrumb trail, and the FAQ. FAQ rich results were
// retired by Google in 2026, but the schema still helps answer engines and
// keeps the page's semantics explicit, so it stays.
export function calculatorJsonLd(def: CalculatorDef): Record<string, unknown> {
  const url = `${SITE_URL}/calculators/${def.slug}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        name: def.h1,
        description: def.metaDescription,
        url,
        applicationCategory: "FinanceApplication",
        operatingSystem: "Web",
        inLanguage: "en-IN",
        offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: "Calculators", item: `${SITE_URL}/calculators` },
          { "@type": "ListItem", position: 3, name: def.navLabel, item: url },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: def.faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  };
}
