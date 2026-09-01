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
  });
});
