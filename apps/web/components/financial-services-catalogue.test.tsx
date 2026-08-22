import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FinancialServicesCatalogue } from "@/components/financial-services-catalogue";
import { HomeCalculators } from "@/components/home-calculators";
import { LineSplit } from "@/components/line-split";
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

  it("places the restored Loans and Properties bands before the calculator section", () => {
    const markup = renderToStaticMarkup(
      <>
        <LineSplit />
        <HomeCalculators />
      </>,
    );

    expect(markup).toContain("Loans, cards, and insurance that fit you");
    expect(markup).toContain("Buy your property with confidence");
    expect(markup).toContain("EMI Calculator");
    expect(markup).toContain("Loan Eligibility");
    expect(markup).toContain("Home Affordability");
    expect(markup).toContain("Stamp Duty");
    expect(markup).toContain('href="/calculators"');
    expect(markup.indexOf("Loans, cards, and insurance that fit you")).toBeLessThan(
      markup.indexOf("Buy your property with confidence"),
    );
    expect(markup.indexOf("Buy your property with confidence")).toBeLessThan(
      markup.indexOf("Calculate before you decide"),
    );
    expect(markup).not.toContain("Free planning tools");
    expect(markup).toContain("bg-background");
  });
});
