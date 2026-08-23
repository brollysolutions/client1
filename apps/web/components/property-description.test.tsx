import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PropertyDescription } from "@/components/property-description";

const SHORT_TEXT = "A cosy 2 BHK apartment close to schools and the metro.";

const LONG_TEXT =
  "This 3 BHK villa sits on a corner plot with an open west-facing lawn and covered parking for two cars. " +
  "The living area opens onto a landscaped garden, and the kitchen has a separate utility yard. " +
  "Upstairs, all three bedrooms are en-suite with built-in wardrobes and a shared terrace that catches the " +
  "evening breeze. The clubhouse, gym, and children's play area are a short walk away, and the gated " +
  "community has round-the-clock security and covered visitor parking near the main gate.";

describe("PropertyDescription", () => {
  it("renders short text with no toggle", () => {
    const markup = renderToStaticMarkup(<PropertyDescription text={SHORT_TEXT} />);
    expect(markup).toContain(SHORT_TEXT);
    expect(markup).not.toContain("See more");
    expect(markup).not.toContain("aria-expanded");
  });

  it("renders long text with a collapsed See more toggle and the full text in the DOM", () => {
    const markup = renderToStaticMarkup(<PropertyDescription text={LONG_TEXT} />);
    expect(markup).toContain("See more");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("inert=\"\"");
    // Full text stays in the DOM (collapsed via CSS opacity/height, not
    // truncated away) so it remains findable and SEO-visible.
    expect(markup).toContain("evening breeze");
    expect(markup).toContain("main gate");
  });
});
