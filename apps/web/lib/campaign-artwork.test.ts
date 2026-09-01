import { describe, expect, it } from "vitest";

import {
  ARTWORK_SURFACES,
  ARTWORK_SURFACE_ORDER,
  BANNER_USAGE_TYPES_BY_PLACEMENT,
  fitsSurface,
  formatTargetSize,
  primaryUsageType,
  surfaceFor,
} from "./campaign-artwork";

describe("campaign artwork surfaces", () => {
  it("keeps a distinct shape for every surface it groups by", () => {
    // The whole point of the split: if two surfaces shared a ratio, grouping by
    // surface would stop telling a Sub Admin anything the old flat grid didn't.
    const hero = ARTWORK_SURFACES.homepage_banner;
    const section = ARTWORK_SURFACES.section_banner;
    expect(hero.width / hero.height).toBeCloseTo(1.8, 2);
    expect(section.width / section.height).toBeCloseTo(2.5, 2);
    expect(hero.aspectClass).not.toBe(section.aspectClass);
  });

  it("orders every known surface exactly once", () => {
    expect([...ARTWORK_SURFACE_ORDER].sort()).toEqual(Object.keys(ARTWORK_SURFACES).sort());
  });

  it("never lets one public placement borrow another's artwork bucket", () => {
    expect(BANNER_USAGE_TYPES_BY_PLACEMENT.homepage).not.toContain("section_banner");
    expect(BANNER_USAGE_TYPES_BY_PLACEMENT.financial_services).not.toContain("homepage_banner");
    expect(BANNER_USAGE_TYPES_BY_PLACEMENT.homepage_ad).not.toContain("homepage_banner");
    // Multi-use artwork is the one bucket every placement shares.
    for (const usageTypes of Object.values(BANNER_USAGE_TYPES_BY_PLACEMENT)) {
      expect(usageTypes).toContain("campaign");
      expect(usageTypes[0]).not.toBe("campaign");
    }
  });

  it("names the surface a new upload should default to", () => {
    expect(primaryUsageType("homepage")).toBe("homepage_banner");
    expect(primaryUsageType("homepage_ad")).toBe("sponsor");
    expect(primaryUsageType("properties")).toBe("section_banner");
    expect(primaryUsageType("dashboard")).toBe("dashboard_banner");
  });

  it("flags multi-use artwork that would be cropped by the target surface", () => {
    const hero = ARTWORK_SURFACES.homepage_banner;
    expect(fitsSurface({ width: 1440, height: 800 }, hero)).toBe(true);
    expect(fitsSurface({ width: 1440, height: 576 }, hero)).toBe(false);
    // Bundled artwork without recorded dimensions must not be flagged on a guess.
    expect(fitsSurface({ width: null, height: null }, hero)).toBe(true);
  });

  it("places legacy public_banner rows without crashing", () => {
    const legacy = surfaceFor("public_banner");
    expect(legacy.label).toContain("legacy");
    expect(formatTargetSize(legacy)).toMatch(/\d+ × \d+/);
  });
});
