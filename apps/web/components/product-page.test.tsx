import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProductPage } from "@/components/product-page";
import { LOAN_PRODUCT_BANDS } from "@/lib/products";

describe("ProductPage product bands", () => {
  it("keeps Loans category headings free of descriptions and product-count pills", () => {
    const markup = renderToStaticMarkup(
      <ProductPage
        title="Loans"
        intro="Find a product that fits."
        productsHeading="Explore products"
        productBands={LOAN_PRODUCT_BANDS}
        beforeHero={<div />}
        journeyHeading="How it works"
        journey={[]}
        ctaHeading="Talk to us"
        ctaText="We can help."
        ctaLabel="Contact us"
        businessLine="loans"
      />,
    );

    expect(markup).toContain("Cards and insurance");
    expect(markup).not.toContain("Eleven ways to borrow");
    expect(markup).not.toContain("Protect what matters and spend smarter");
    expect(markup).not.toMatch(/>11 products</);
    expect(markup).not.toMatch(/>5 products</);
  });
});
