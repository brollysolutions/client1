import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BannerPreview, ContentPreview, formatOfferBadge, OfferPreview } from "./cms-previews";

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

  it("preserves integer trailing zeroes while trimming decimal padding", () => {
    const offer = { title: "Fee waiver", description: null, discount_type: "fixed", discount_value: "100.00", code: "SAVE100" };
    expect(formatOfferBadge(offer)).toBe("Fee waiver · ₹100 off · Code SAVE100");
  });

  it("renders governed artwork and linked Offer copy in the public preview", () => {
    const markup = renderToStaticMarkup(
      <BannerPreview
        context="public"
        placement="properties"
        banner={{
          banner_type: "default",
          title: "Find your next home",
          subtitle: "Verified properties",
          cta_label: "Explore",
          deep_link: "/real-estate",
          image_url: "/banner-templates/properties/villas.webp",
          offer_badge: "10% off · Code HOME10",
          rera_verified: true,
        }}
      />,
    );
    expect(markup).toContain("/banner-templates/properties/villas.webp");
    expect(markup).toContain("10% off · Code HOME10");
    expect(markup).toContain("RERA VERIFIED");
    expect(markup).toContain("Find your next home");
    expect(markup).toContain("aspect-[5/2]");
  });

  it("uses the exact split sponsor card for homepage ad previews", () => {
    const markup = renderToStaticMarkup(
      <BannerPreview
        context="public"
        placement="homepage_ad"
        banner={{
          banner_type: "default",
          title: "Plan your next move",
          subtitle: "Sponsored by a verified partner",
          cta_label: "Explore",
          deep_link: "/loans",
          image_url: "/banner-templates/homepage_ad/personal-finance.webp",
        }}
      />,
    );
    expect(markup).toContain('data-presentation="split-sponsor-card"');
    expect(markup).toContain("personal-finance.webp");
    expect(markup).not.toContain('aria-label="Dismiss sponsored message"');
  });

  it("keeps website body copy as escaped plain text", () => {
    const markup = renderToStaticMarkup(<ContentPreview block={{ title: "Safe copy", body: "<script>alert(1)</script>" }} />);
    expect(markup).toContain("&lt;script&gt;");
    expect(markup).not.toContain("<script>");
  });
});
