import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The catalogue's filter bar is a client island that calls useRouter for the
// debounced, button-free search. There is no app-router context under
// renderToStaticMarkup, so stub the hook to keep this a markup-shape test.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

import { FinancialServicesCatalogue } from "@/components/financial-services-catalogue";
import { HomeCalculators } from "@/components/home-calculators";
import { LineSplit } from "@/components/line-split";
import type { CatalogueFacets, PublicFinancialProduct } from "@/lib/financial-catalog";

// The fixtures are all `category: "loan"`, so the loan facet carries the total.
function facets(total: number): CatalogueFacets {
  return { all: total, loan: total, credit_card: 0, insurance: 0 };
}

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
        facets={facets(13)}
        query={{ q: "configured", category: "loan", page: 1 }}
      />,
    );

    expect(markup).toContain('href="/loans/personal-loan"');
    expect(markup.indexOf(">Explore<")).toBeLessThan(markup.indexOf("Enquire now"));
    expect(markup).toContain("q=configured&amp;category=loan&amp;page=2");
    expect(markup).not.toMatch(/href="https?:\/\//);
  });

  it("filters as you type: no submit button, no eyebrow, and a header-flush sticky bar", () => {
    const markup = renderToStaticMarkup(
      <FinancialServicesCatalogue
        catalogue={{ items: [product(1)], total: 1, page: 1, page_size: 12 }}
        facets={facets(1)}
        query={{ page: 1 }}
      />,
    );

    // The old "Show results" gate and the section eyebrow were both removed.
    expect(markup).not.toContain("Show results");
    expect(markup).not.toContain("Admin-curated catalogue");
    // The search input carries its own accessible name instead of a visible
    // label, so no eyebrow-style label text sits above the bar.
    expect(markup).not.toContain(">Search services<");
    expect(markup).toContain('aria-label="Search financial services"');

    // Seats flush under the 64px sticky SiteHeader and below its z-40.
    expect(markup).toMatch(/class="[^"]*sticky top-16 z-30[^"]*"/);
    // No opaque white panel behind the bar.
    expect(markup).not.toMatch(/class="[^"]*sticky top-16[^"]*bg-card[^"]*"/);

    // Category filtering still degrades to real links without JS.
    expect(markup).toContain('href="/loans?category=insurance"');
    expect(markup).toContain('href="/loans"');
  });

  it("gives every published slug artwork, including ones absent from LOAN_PRODUCTS", () => {
    const markup = renderToStaticMarkup(
      <FinancialServicesCatalogue
        catalogue={{
          items: [
            { ...product(1), slug: "equipment-financing", provider_count: 0 },
            { ...product(2), slug: "not-a-real-service", provider_count: 0 },
          ],
          total: 2,
          page: 1,
          page_size: 12,
        }}
        facets={facets(2)}
        query={{ page: 1 }}
      />,
    );

    // equipment-financing is Admin-published but is not a marketing product,
    // so it resolves through the catalogue-only illustration map.
    expect(markup).toContain("equipment-financing.svg");
    // An unknown slug still gets the designed category plate, and a zero
    // provider count is never rendered as a "0 providers" badge.
    expect(markup).toContain(">Loans<");
    expect(markup).not.toContain("0 provider");
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
