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
    expect(markup).toContain("/brand/logo-horizontal.png");
  });

  it("supports constrained and unlinked placements without losing identity", () => {
    const symbol = renderToStaticMarkup(<Logo variant="symbol" href="/dashboard" />);
    expect(symbol).toContain('href="/dashboard"');
    expect(symbol).toContain("/brand/symbol.png");
    expect(symbol).toContain('alt="Dhanadhara"');
    const stacked = renderToStaticMarkup(<Logo variant="stacked" href={null} />);
    expect(stacked).not.toContain("<a ");
    expect(stacked).toContain("/brand/logo-stacked.png");
  });
});
