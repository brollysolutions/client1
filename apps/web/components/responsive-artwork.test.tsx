import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ResponsiveArtwork } from "./responsive-artwork";

describe("ResponsiveArtwork", () => {
  it("keeps eager desktop SVGs behind a media source without an unconditional preload", () => {
    const markup = renderToStaticMarkup(
      <ResponsiveArtwork
        src="/illustrations/calculators/emi.svg"
        media="(min-width: 1024px)"
        width={750}
        height={500}
        loading="eager"
        fetchPriority="high"
      />,
    );
    expect(markup).toContain('<source media="(min-width: 1024px)"');
    expect(markup).toContain('srcSet="/illustrations/calculators/emi.svg"');
    expect(markup).toContain('src="data:image/svg+xml,');
    expect(markup).toContain('width="750"');
    expect(markup).toContain('height="500"');
    expect(markup).toContain('alt=""');
    expect(markup).not.toContain('rel="preload"');
  });

  it("preserves Next's responsive raster loader when optimization is enabled", () => {
    const markup = renderToStaticMarkup(
      <ResponsiveArtwork
        src="/brand/symbol.png"
        media="(min-width: 640px)"
        fill
        sizes="100vw"
      />,
    );
    expect(markup).toContain("/_next/image?url=%2Fbrand%2Fsymbol.png");
    expect(markup).toContain('sizes="100vw"');
    expect(markup).toContain("position:absolute");
    expect(markup).toContain('loading="lazy"');
    expect(markup).not.toContain('rel="preload"');
  });
});
