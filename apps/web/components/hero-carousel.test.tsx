import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HeroCarousel } from "@/components/hero-carousel";

describe("HeroCarousel", () => {
  it("renders a labeled section carousel with decorative artwork and Offer copy", () => {
    const markup = renderToStaticMarkup(
      <HeroCarousel
        variant="section"
        label="Property campaigns"
        banners={[
          {
            id: "one",
            title: "A villa that fits your family",
            subtitle: "Tour verified homes",
            image: "/banner-templates/properties/villas.webp",
            offerBadge: "10% off · Code HOME10",
            reraVerified: true,
            cta: { label: "Explore", href: "/real-estate" },
          },
          { id: "two", title: "Property guidance" },
        ]}
      />,
    );

    expect(markup).toContain('aria-label="Property campaigns"');
    expect(markup).toContain("/banner-templates/properties/villas.webp");
    expect(markup).toContain('alt=""');
    expect(markup).toContain("10% off · Code HOME10");
    expect(markup).toContain("RERA VERIFIED");
    expect(markup).toContain('href="/real-estate"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('data-layout="full-bleed"');
  });

  it("renders nothing for an empty campaign list", () => {
    expect(renderToStaticMarkup(<HeroCarousel banners={[]} />)).toBe("");
  });
});
