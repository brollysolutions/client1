import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SiteFooter } from "@/components/site-footer";

describe("footer public navigation", () => {
  it("keeps support and property routes available when no financial products are published", () => {
    const html = renderToStaticMarkup(<SiteFooter />);
    expect(html).not.toContain('href="/loans"');
    for (const path of ["/real-estate", "/calculators", "/get-started", "/help-center", "/contact"]) {
      expect(html).toContain(`href="${path}"`);
    }
    expect(html.match(/href="\/help-center"/g)).toHaveLength(1);
  });

  it("routes published financial services through the catalogue without stale product anchors", () => {
    const html = renderToStaticMarkup(<SiteFooter products={[{ slug: "personal-loan", label: "Personal Loan", category: "loan" }]} />);
    expect(html).toContain('href="/loans"');
    expect(html).not.toContain('href="/loans#');
    expect(html).not.toContain('href="/loans/personal-loan"');
  });
});
