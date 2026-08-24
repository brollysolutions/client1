import { describe, expect, it } from "vitest";

import { resolveShortlistedOffers } from "./loan-offers-view";
import type { ShortlistedOffer } from "./loan-offers-store";
import type { PublicFinancialProduct, PublicProviderOffer } from "@/lib/financial-catalog";

function product(
  category: PublicFinancialProduct["category"],
  slug: string,
): PublicFinancialProduct {
  return {
    id: `product-${slug}`,
    slug,
    label: `Label ${slug}`,
    category,
    summary: "",
    description: "",
    highlights: [],
    eligibility: [],
    documents: [],
    faq: [],
    homepage_featured: false,
    provider_count: 1,
    updated_at: "2026-08-21T00:00:00Z",
  };
}

function offer(id: string): PublicProviderOffer {
  return {
    id,
    offer_name: `Offer ${id}`,
    summary: null,
    provider: { id: `provider-${id}`, name: `Provider ${id}`, legal_name: null, provider_type: "bank", logo_url: null },
    min_amount: null,
    max_amount: null,
    min_interest_rate: null,
    max_interest_rate: null,
    min_tenure_months: null,
    max_tenure_months: null,
    processing_fee_text: null,
    eligibility_summary: null,
    last_verified_at: null,
  };
}

function shortlisted(offerId: string, productSlug: string): ShortlistedOffer {
  return { offerId, productSlug };
}

describe("resolveShortlistedOffers()", () => {
  it("resolves an offer matched by product slug and offer id", () => {
    const { resolved, droppedOfferIds } = resolveShortlistedOffers(
      [shortlisted("offer-1", "personal-loan")],
      { "personal-loan": { product: product("loan", "personal-loan"), offers: [offer("offer-1")] } },
    );

    expect(droppedOfferIds).toEqual([]);
    expect(resolved).toEqual([
      {
        offerId: "offer-1",
        productSlug: "personal-loan",
        productId: "product-personal-loan",
        productLabel: "Label personal-loan",
        offer: offer("offer-1"),
      },
    ]);
  });

  it("drops an offer whose product 404'd", () => {
    const { resolved, droppedOfferIds } = resolveShortlistedOffers(
      [shortlisted("offer-1", "missing-product")],
      { "missing-product": { product: null, offers: [] } },
    );

    expect(resolved).toEqual([]);
    expect(droppedOfferIds).toEqual(["offer-1"]);
  });

  it("drops an offer whose product is not a loan product", () => {
    const { resolved, droppedOfferIds } = resolveShortlistedOffers(
      [shortlisted("offer-1", "term-cover")],
      { "term-cover": { product: product("insurance", "term-cover"), offers: [offer("offer-1")] } },
    );

    expect(resolved).toEqual([]);
    expect(droppedOfferIds).toEqual(["offer-1"]);
  });

  it("drops an offer no longer present in its product's published offers", () => {
    const { resolved, droppedOfferIds } = resolveShortlistedOffers(
      [shortlisted("offer-1", "personal-loan")],
      { "personal-loan": { product: product("loan", "personal-loan"), offers: [offer("offer-2")] } },
    );

    expect(resolved).toEqual([]);
    expect(droppedOfferIds).toEqual(["offer-1"]);
  });

  it("resolves multiple shortlisted offers across different products", () => {
    const { resolved, droppedOfferIds } = resolveShortlistedOffers(
      [shortlisted("offer-1", "personal-loan"), shortlisted("offer-2", "home-loan")],
      {
        "personal-loan": { product: product("loan", "personal-loan"), offers: [offer("offer-1")] },
        "home-loan": { product: product("loan", "home-loan"), offers: [offer("offer-2")] },
      },
    );

    expect(droppedOfferIds).toEqual([]);
    expect(resolved.map((item) => item.offerId)).toEqual(["offer-1", "offer-2"]);
  });
});
