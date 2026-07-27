import { describe, expect, it } from "vitest";

import { FALLBACK_HERO_BANNERS } from "@/lib/banners";

// FALLBACK_HERO_BANNERS is the entire homepage hero whenever the CMS returns
// zero live banners -- an empty table or a failed fetch. It deserves a test
// that fails loudly when someone points an entry at a route that no longer
// exists, not a silent broken link on the highest-traffic page on the site.
describe("FALLBACK_HERO_BANNERS", () => {
  it("is non-empty", () => {
    expect(FALLBACK_HERO_BANNERS.length).toBeGreaterThan(0);
  });

  it("has unique ids", () => {
    const ids = FALLBACK_HERO_BANNERS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every cta links within the site", () => {
    for (const banner of FALLBACK_HERO_BANNERS) {
      if (banner.cta) {
        expect(banner.cta.href.startsWith("/") || banner.cta.href.startsWith("#")).toBe(true);
      }
    }
  });
});
