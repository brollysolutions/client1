import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import FinancialServicePage, { generateMetadata } from "@/app/(public)/loans/[slug]/page";
import sitemap from "@/app/sitemap";
import { getPublishedServiceProducts, getPublicFinancialProduct, getPublicProviderOffers } from "@/lib/financial-catalog";
import { financialServiceHref, LOAN_PRODUCTS } from "@/lib/products";
import { SITE_URL } from "@/lib/site";

vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());
vi.mock("@/lib/financial-catalog", () => ({
  getPublishedServiceProducts: vi.fn(),
  getPublicFinancialProduct: vi.fn(),
  getPublicProviderOffers: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  permanentRedirect: (href: string) => { throw new Error(`REDIRECT:${href}`); },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPublishedServiceProducts).mockResolvedValue([]);
  vi.mocked(getPublicFinancialProduct).mockResolvedValue(null);
});

describe("financial service overview pages", () => {
  it.each(LOAN_PRODUCTS)("$label stays hidden when inactive, unpublished or deleted", async (service) => {
    const href = financialServiceHref(service.id);
    const params = Promise.resolve({ slug: href.replace("/loans/", "") });
    await expect(FinancialServicePage({ params, searchParams: Promise.resolve({}) })).rejects.toThrow("NOT_FOUND");
    expect(getPublicProviderOffers).not.toHaveBeenCalled();
    expect((await generateMetadata({ params })).robots).toEqual({ index: false, follow: false });
    expect((await sitemap()).some((entry) => entry.url === `${SITE_URL}${href}`)).toBe(false);
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

  it("includes currently published services in the sitemap, including configured products", async () => {
    vi.mocked(getPublishedServiceProducts).mockResolvedValue([
      { slug: "personal-loan" }, { slug: "equipment-financing" }, { slug: "credit-cards" },
    ] as Awaited<ReturnType<typeof getPublishedServiceProducts>>);
    const urls = (await sitemap()).map((item) => item.url);
    expect(urls).toContain(`${SITE_URL}/loans/equipment-financing`);
    expect(urls).toContain(`${SITE_URL}/loans/credit-card`);
    expect(urls).not.toContain(`${SITE_URL}/loans/home-loan`);
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
