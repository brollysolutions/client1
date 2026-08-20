import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PanoramaViewer } from "@/components/panorama-viewer";

describe("PanoramaViewer", () => {
  it("exposes keyboard instructions and labelled pan controls", () => {
    const markup = renderToStaticMarkup(
      <PanoramaViewer src="https://media.test/panorama.webp" title="Baner Heights" />,
    );

    expect(markup).toContain("Baner Heights interactive 360 degree panorama");
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('aria-label="Pan panorama left"');
    expect(markup).toContain('aria-label="Pan panorama right"');
    expect(markup).toContain("Drag horizontally or use the arrow keys");
  });
});
