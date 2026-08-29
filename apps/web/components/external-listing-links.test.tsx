import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ExternalListingLinks } from "@/components/external-listing-links";

describe("ExternalListingLinks", () => {
  it("renders nothing when there are no links", () => {
    expect(renderToStaticMarkup(<ExternalListingLinks links={null} />)).toBe("");
    expect(renderToStaticMarkup(<ExternalListingLinks links={[]} />)).toBe("");
  });

  it("opens external destinations in a new tab without leaking the opener", () => {
    const html = renderToStaticMarkup(
      <ExternalListingLinks links={[{ url: "https://youtu.be/abc", platform: "youtube" }]} />,
    );

    expect(html).toContain('href="https://youtu.be/abc"');
    expect(html).toContain('target="_blank"');
    // noopener AND noreferrer: these are third-party destinations reached from
    // a financial site, so neither the opener handle nor the referrer travels.
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("labels the link by the host, not by the stored platform", () => {
    const html = renderToStaticMarkup(
      <ExternalListingLinks
        links={[{ url: "https://www.instagram.com/reel/abc/", platform: "youtube" }]}
      />,
    );

    expect(html).toContain("Instagram");
    expect(html).not.toContain("YouTube");
  });

  it("omits a link whose host is no longer allowlisted", () => {
    const html = renderToStaticMarkup(
      <ExternalListingLinks
        links={[
          { url: "https://youtu.be/abc", platform: "youtube" },
          { url: "https://phish.example/listing", platform: "facebook" },
        ]}
      />,
    );

    expect(html).toContain("https://youtu.be/abc");
    expect(html).not.toContain("phish.example");
  });

  it("tells assistive tech that the link leaves the page", () => {
    const html = renderToStaticMarkup(
      <ExternalListingLinks links={[{ url: "https://youtu.be/abc", platform: "youtube" }]} />,
    );

    expect(html).toContain("opens in a new tab");
  });
});
