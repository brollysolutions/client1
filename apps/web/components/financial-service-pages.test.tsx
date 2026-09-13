import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import FinancialServicePage, { generateMetadata } from "@/app/(public)/loans/[slug]/page";
import sitemap from "@/app/sitemap";
import { getPublicFinancialProduct, getPublicProviderOffers } from "@/lib/financial-catalog";
import { FINANCIAL_SERVICE_GUIDES } from "@/lib/financial-service-guides";
import { financialServiceHref, LOAN_PRODUCTS } from "@/lib/products";
import { SITE_URL } from "@/lib/site";

vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());
vi.mock("@/lib/financial-catalog", () => ({
  getPublicFinancialProduct: vi.fn(),
  getPublicProviderOffers: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  permanentRedirect: (href: string) => { throw new Error(`REDIRECT:${href}`); },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPublicFinancialProduct).mockResolvedValue(null);
});

describe("financial service overview pages", () => {
  it.each(LOAN_PRODUCTS)("$label has a complete page without a published provider product", async (service) => {
    const href = financialServiceHref(service.id);
    const params = Promise.resolve({ slug: href.replace("/loans/", "") });
    const page = await FinancialServicePage({ params, searchParams: Promise.resolve({}) });
    const markup = renderToStaticMarkup(page);
    expect(markup).toContain(`<h1`);
    expect(markup).toContain(service.label);
    expect(markup).toContain("Plan your enquiry");
    expect(FINANCIAL_SERVICE_GUIDES[service.id].topics).toHaveLength(3);
    expect(markup).toContain(service.illustration!.replaceAll("/", "%2F"));
    expect(markup).toContain("logo-horizontal.png");
    expect(markup).toContain("/contact?line=loans&amp;product=");
    expect(markup).not.toContain("dashboard%2Fapply");
    expect(markup).toContain('id="providers"');
    expect(markup).toContain("Compare configured provider options");
    expect(markup).toContain("Search providers");
    expect(markup).toContain("No provider options published yet");
    expect(getPublicProviderOffers).not.toHaveBeenCalled();
    const metadata = await generateMetadata({ params });
    expect(metadata.alternates?.canonical).toBe(href);
    expect(metadata.openGraph).toMatchObject({ title: service.label, description: service.description });
    expect(sitemap().some((entry) => entry.url === `${SITE_URL}${href}`)).toBe(true);
  });

  it.each(LOAN_PRODUCTS)("$label keeps the provider comparison and application journey when published", async (service) => {
    const slug = financialServiceHref(service.id).replace("/loans/", "");
    vi.mocked(getPublicFinancialProduct).mockResolvedValue({ id: "example", slug, label: service.label, summary: "Published summary", description: "Published description", category: service.group === "insurance" ? "insurance" : service.group === "credit-cards" ? "credit_card" : "loan", highlights: [], eligibility: [], documents: [], faq: [], homepage_featured: false, provider_count: 0, updated_at: "2026-09-13T00:00:00Z" });
    vi.mocked(getPublicProviderOffers).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 9 });
    const page = await FinancialServicePage({ params: Promise.resolve({ slug }), searchParams: Promise.resolve({}) });
    const markup = renderToStaticMarkup(page);
    expect(markup).toContain("Published description");
    expect(markup).toContain(`dashboard%2Fapply%3Fproduct%3D${slug}`);
    expect(markup).toContain("Compare configured provider options");
    expect(getPublicProviderOffers).toHaveBeenCalledWith(slug, expect.any(Object));
  });

  it("retains overview provider filters without exposing unpublished offers or application links", async () => {
    const page = await FinancialServicePage({ params: Promise.resolve({ slug: "school-funding" }), searchParams: Promise.resolve({ provider_q: "Local review", provider_type: "nbfc", sort: "amount", amount: "200000", interest_rate_max: "invalid", tenure_months: "12" }) });
    const markup = renderToStaticMarkup(page);
    expect(markup).toContain('value="Local review"');
    expect(markup).toContain('value="nbfc" selected=""');
    expect(markup).toContain('value="amount" selected=""');
    expect(markup).toContain('value="200000"');
    expect(markup).toContain("0 published options");
    expect(markup).toContain("Clear filters");
    expect(markup).not.toContain("dashboard%2Fapply");
    expect(getPublicProviderOffers).not.toHaveBeenCalled();
  });

  it("keeps unknown unpublished slugs as not found", async () => {
    await expect(FinancialServicePage({ params: Promise.resolve({ slug: "not-a-service" }), searchParams: Promise.resolve({}) })).rejects.toThrow("NOT_FOUND");
    expect(getPublicProviderOffers).not.toHaveBeenCalled();
  });

  it("keeps a published plural card slug for offers and applications under the canonical page URL", async () => {
    vi.mocked(getPublicFinancialProduct).mockImplementation(async (slug) => slug === "credit-cards" ? { id: "example", slug, label: "Credit Cards", summary: "Published cards", description: "Published card description", category: "credit_card", highlights: [], eligibility: [], documents: [], faq: [], homepage_featured: false, provider_count: 0, updated_at: "2026-09-13T00:00:00Z" } : null);
    vi.mocked(getPublicProviderOffers).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 9 });
    const params = Promise.resolve({ slug: "credit-card" });
    const page = await FinancialServicePage({ params, searchParams: Promise.resolve({}) });
    expect(renderToStaticMarkup(page)).toContain("dashboard%2Fapply%3Fproduct%3Dcredit-cards");
    expect(getPublicProviderOffers).toHaveBeenCalledWith("credit-cards", expect.any(Object));
    expect((await generateMetadata({ params })).alternates?.canonical).toBe("/loans/credit-card");
  });

  it("redirects the plural credit-card alias without losing provider filters", async () => {
    await expect(FinancialServicePage({ params: Promise.resolve({ slug: "credit-cards" }), searchParams: Promise.resolve({ provider_q: "Example provider", provider_page: "2" }) })).rejects.toThrow("REDIRECT:/loans/credit-card?provider_q=Example+provider&provider_page=2");
    expect(getPublicFinancialProduct).not.toHaveBeenCalled();
  });
});
