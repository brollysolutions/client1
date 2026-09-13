import { describe, expect, it } from "vitest";
import type { PublicFinancialProduct } from "./financial-catalog";
import { LOAN_PRODUCTS } from "./products";
import { buildServiceDirectory } from "./service-directory";

function published(slug: string, category: PublicFinancialProduct["category"] = "loan"): PublicFinancialProduct {
  return { id: slug, slug, label: slug, summary: `Published ${slug}`, description: "", category, highlights: [], eligibility: [], documents: [], faq: [], homepage_featured: false, provider_count: 0, updated_at: "2026-09-13T00:00:00Z" };
}

describe("public service directory", () => {
  it("shows every navbar service with 11/4/1 counts even when no provider catalogue is available", () => {
    const { catalogue, facets } = buildServiceDirectory([]);
    expect(facets).toEqual({ all: 16, loan: 11, insurance: 4, credit_card: 1 });
    expect(catalogue.items.map((item) => item.id)).toEqual(LOAN_PRODUCTS.map((item) => item.id));
    expect(catalogue.items.every((item) => item.detailHref?.startsWith("/loans/"))).toBe(true);
  });

  it("joins the six published examples while keeping all 16 overview pages discoverable", () => {
    const products = [published("personal-loan"), published("business-loan"), published("home-loan"), published("credit-card", "credit_card"), published("health-insurance", "insurance"), published("travel-insurance", "insurance")];
    const { catalogue } = buildServiceDirectory(products);
    expect(catalogue.total).toBe(16);
    expect(catalogue.items.filter((item) => item.detailHref)).toHaveLength(16);
    expect(catalogue.items.find((item) => item.id === "credit-cards")?.detailHref).toBe("/loans/credit-card");
    expect(catalogue.items.find((item) => item.id === "home-loan")?.legacyAnchorId).toBe("property-loan");
    expect(catalogue.items.find((item) => item.id === "school-funding")?.detailHref).toBe("/loans/school-funding");
  });

  it("retains additional published products and paginates without hiding the core service types", () => {
    const products = Array.from({ length: 20 }, (_, index) => published(`configured-${index}`));
    const first = buildServiceDirectory(products);
    const second = buildServiceDirectory(products, { page: 2 });
    expect(first.catalogue.total).toBe(36);
    expect(first.catalogue.items).toHaveLength(24);
    expect(second.catalogue.items).toHaveLength(12);
    expect(new Set([...first.catalogue.items, ...second.catalogue.items].map((item) => item.id)).size).toBe(36);
    expect(second.catalogue.items.every((item) => item.detailHref?.startsWith("/loans/configured-"))).toBe(true);
  });

  it("filters the full service range and keeps category counts accurate", () => {
    const { catalogue, facets } = buildServiceDirectory([], { q: "insurance", category: "insurance" });
    expect(catalogue.items).toHaveLength(4);
    expect(facets).toEqual({ all: 4, insurance: 4, loan: 0, credit_card: 0 });
    expect(buildServiceDirectory([], { q: "no-match" }).catalogue.items).toEqual([]);
  });
});
