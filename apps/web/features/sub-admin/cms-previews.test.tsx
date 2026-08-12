import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BannerPreview, ContentPreview, OfferPreview } from "./cms-previews";

describe("CMS previews", () => {
  it("renders banner actions only for safe local destinations", () => {
    const safe = renderToStaticMarkup(<BannerPreview context="dashboard" banner={{ banner_type: "action", title: "Finish KYC", subtitle: null, cta_label: "Continue", deep_link: "/dashboard/settings" }} />);
    const unsafe = renderToStaticMarkup(<BannerPreview context="dashboard" banner={{ banner_type: "action", title: "Finish KYC", subtitle: null, cta_label: "Continue", deep_link: "https://evil.example" }} />);
    expect(safe).toContain("Continue");
    expect(unsafe).not.toContain("Continue");
  });

  it("renders the public and dashboard offer presentations from draft values", () => {
    const offer = { title: "Fee waiver", description: "Save on processing", discount_type: "percentage", discount_value: "10", code: "SAVE10" };
    expect(renderToStaticMarkup(<OfferPreview context="public" offer={offer} />)).toContain("10% off");
    expect(renderToStaticMarkup(<OfferPreview context="dashboard" offer={offer} />)).toContain("Code SAVE10");
  });

  it("keeps website body copy as escaped plain text", () => {
    const markup = renderToStaticMarkup(<ContentPreview block={{ title: "Safe copy", body: "<script>alert(1)</script>" }} />);
    expect(markup).toContain("&lt;script&gt;");
    expect(markup).not.toContain("<script>");
  });
});
