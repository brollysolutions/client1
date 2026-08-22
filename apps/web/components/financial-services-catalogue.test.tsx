import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FinancialServicesCatalogue } from "@/components/financial-services-catalogue";
import { HomeCalculators } from "@/components/home-calculators";
import { HomeFinancialServices } from "@/components/home-financial-services";
import type { PublicFinancialProduct } from "@/lib/financial-catalog";

function product(index: number): PublicFinancialProduct {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    slug: index === 1 ? "personal-loan" : `configured-service-${index}`,
    label: `Configured Service ${index}`,
    category: "loan",
    summary: `Summary ${index}`,
    description: `Description ${index}`,
    highlights: [],
    eligibility: [],
    documents: [],
    faq: [],
    homepage_featured: true,
    provider_count: index,
    updated_at: "2026-08-22T00:00:00Z",
  };
}

describe("Financial Services public discovery", () => {
  it("renders internal Explore before Enquire and preserves catalogue filters in pagination", () => {
    const markup = renderToStaticMarkup(
      <FinancialServicesCatalogue
        catalogue={{ items: [product(1)], total: 13, page: 1, page_size: 12 }}
        query={{ q: "configured", category: "loan", page: 1 }}
      />,
    );

    expect(markup).toContain('href="/loans/personal-loan"');
    expect(markup.indexOf(">Explore<")).toBeLessThan(markup.indexOf("Enquire now"));
    expect(markup).toContain("q=configured&amp;category=loan&amp;page=2");
    expect(markup).not.toMatch(/href="https?:\/\//);
  });

  it("limits the homepage curation to six configured services", () => {
    const markup = renderToStaticMarkup(
      <HomeFinancialServices products={Array.from({ length: 7 }, (_, index) => product(index + 1))} />,
    );

    expect(markup).toContain("Configured Service 6");
    expect(markup).not.toContain("Configured Service 7");
    expect(markup).toContain("Curated by Dhanadhara");
    expect(markup).not.toMatch(/href="https?:\/\//);
  });

  it("keeps the four fixed calculators and the full calculator-hub link on Home", () => {
    const markup = renderToStaticMarkup(<HomeCalculators />);

    expect(markup).toContain("EMI Calculator");
    expect(markup).toContain("Loan Eligibility");
    expect(markup).toContain("Home Affordability");
    expect(markup).toContain("Stamp Duty");
    expect(markup).toContain('href="/calculators"');
  });
});
