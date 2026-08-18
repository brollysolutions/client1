import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OfferStrip } from "@/components/offer-strip";
import type { PublicOffer } from "@/lib/offers";

const LOAN_OFFER: PublicOffer = {
  id: "offer-1",
  line: "loans",
  title: "Festive processing-fee waiver",
  description: "No processing fee on personal loans this month.",
  discountLabel: "100% off",
  code: "FEST100",
};

describe("OfferStrip", () => {
  it("renders nothing when there are no offers at all", () => {
    expect(
      renderToStaticMarkup(
        <OfferStrip offers={[]} line="loans" heading="Offers running right now" />,
      ),
    ).toBe("");
  });

  it("renders nothing when no offer matches the page's line", () => {
    const realEstateOnly: PublicOffer = {
      ...LOAN_OFFER,
      id: "offer-2",
      line: "real_estate",
    };
    expect(
      renderToStaticMarkup(
        <OfferStrip
          offers={[realEstateOnly]}
          line="loans"
          heading="Offers running right now"
        />,
      ),
    ).toBe("");
  });

  it("renders the labeled section when a matching offer exists", () => {
    const markup = renderToStaticMarkup(
      <OfferStrip
        offers={[LOAN_OFFER]}
        line="loans"
        heading="Offers running right now"
        subheading="Live discounts on the loans we help you apply for."
      />,
    );
    expect(markup).toContain("Offers running right now");
    expect(markup).toContain("Festive processing-fee waiver");
    expect(markup).toContain("FEST100");
    expect(markup).toContain('aria-labelledby="offers-heading"');
  });
});
