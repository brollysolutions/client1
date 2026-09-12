import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HeroCarousel } from "@/components/hero-carousel";

describe("HeroCarousel", () => {
  it("renders a labeled section carousel with decorative artwork", () => {
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
            reraVerified: true,
            cta: { label: "Explore", href: "/real-estate" },
          },
          { id: "two", title: "Property guidance" },
        ]}
      />,
    );

    expect(markup).toContain('aria-label="Property campaigns"');
    expect(markup).toContain("%2Fbanner-templates%2Fproperties%2Fvillas.webp");
    expect(markup).toContain('alt=""');
    expect(markup).toContain("RERA VERIFIED");
    expect(markup).toContain('href="/real-estate"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('data-layout="full-bleed"');
    expect(markup).toContain("h-[clamp(14rem,36vw,32.5rem)]");
    expect(markup).toContain("mb-4");
    expect(markup).toContain('href="#page-overview"');
    expect(markup).toContain('aria-label="Scroll to page overview"');
    expect(markup).toContain("section-scroll-cue-first");
    expect(markup).toContain('<source media="(min-width: 640px)"');
    expect(markup).not.toContain('rel="preload"');
  });

  it("renders the homepage hero full-bleed and full-screen, with overlaid dots", () => {
    // The homepage hero is the only caller of variant="hero". It used to be a
    // centered peek-coverflow card; it is now edge-to-edge and fills the
    // viewport below the sticky header, so the peek blur must be gone and the
    // dots must overlay the slide rather than adding a strip beneath it.
    const markup = renderToStaticMarkup(
      <HeroCarousel
        banners={[
          { id: "a", title: "First campaign" },
          { id: "b", title: "Second campaign" },
        ]}
      />,
    );
    expect(markup).toContain('data-layout="fullscreen"');
    expect(markup).toContain("h-[calc(100svh-4rem)]");
    expect(markup).toContain("basis-full");
    expect(markup).not.toContain("blur-[4px]");
    expect(markup).not.toContain("aspect-[9/5]");
  });

  it("renders nothing for an empty campaign list", () => {
    expect(renderToStaticMarkup(<HeroCarousel banners={[]} />)).toBe("");
  });

  it("keeps uploaded banner URLs direct behind their visible breakpoint", () => {
    const source = "http://localhost:9000/public/banner.webp";
    const markup = renderToStaticMarkup(
      <HeroCarousel banners={[{ id: "uploaded", title: "Published campaign", image: source }]} />,
    );
    expect(markup).toContain(`srcSet="${source}"`);
    expect(markup).not.toContain("/_next/image?");
    expect(markup).not.toContain('rel="preload"');
  });
});
