import { describe, expect, it } from "vitest";

import { NAV_ITEMS } from "@/components/navbars/nav-items";

// The public header and mobile drawer both render from NAV_ITEMS, and neither
// has Playwright coverage, so a drift here reaches production unnoticed. The
// case this guards specifically: the finance item's label ("Financial Services")
// intentionally does not match its route (/loans), which invites a later
// "consistency" edit that points it at a path with no page behind it.
describe("public NAV_ITEMS integrity", () => {
  it("keeps the financial-services entry pointed at the live /loans route", () => {
    const finance = NAV_ITEMS.find((item) => item.label === "Financial Services");
    expect(finance).toBeDefined();
    expect(finance?.href).toBe("/loans");
  });

  it("gives every item a label and an internal href", () => {
    for (const item of NAV_ITEMS) {
      expect(item.label.trim()).toBeTruthy();
      expect(item.href.startsWith("/")).toBe(true);
    }
  });

  it("has no duplicate hrefs, which would break active-state matching", () => {
    const hrefs = NAV_ITEMS.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
