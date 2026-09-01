import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PropertyRow } from "@/features/real-estate/property-row";

// Explore suppresses empty category rows before it reaches this component. The
// defensive null return below prevents an accidental caller from reintroducing
// an empty section later.

describe("PropertyRow", () => {
  it("renders nothing when there are no listings", () => {
    const markup = renderToStaticMarkup(<PropertyRow heading="Commercial" listings={[]} />);
    expect(markup).toBe("");
  });
});
