import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Logo } from "@/components/logo";

describe("Logo", () => {
  it("renders the canonical Dhanadhara identity and accessible home label", () => {
    const markup = renderToStaticMarkup(<Logo />);

    expect(markup).toContain("Dhanadhara");
    expect(markup).toContain('aria-label="Dhanadhara home"');
    expect(markup).not.toContain("Loans &amp; Real Estate");
    expect(markup).not.toContain("Grow Wealth");
    expect(markup).toContain("%2Fbrand%2Flogo-horizontal.png");
    expect(markup).toContain("/_next/image?");
    expect(markup).toContain('sizes="(min-width: 640px) 176px, 144px"');
  });

  it("supports constrained and unlinked placements without losing identity", () => {
    const symbol = renderToStaticMarkup(<Logo variant="symbol" href="/dashboard" />);
    expect(symbol).toContain('href="/dashboard"');
    expect(symbol).toContain("%2Fbrand%2Fsymbol.png");
    expect(symbol).toContain('sizes="40px"');
    expect(symbol).toContain('alt="Dhanadhara"');
    const stacked = renderToStaticMarkup(<Logo variant="stacked" href={null} />);
    expect(stacked).not.toContain("<a ");
    expect(stacked).toContain("%2Fbrand%2Flogo-stacked.png");
    expect(stacked).toContain('sizes="192px"');
  });
});
