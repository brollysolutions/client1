import { describe, expect, it } from "vitest";

import { FINANCIAL_SERVICES_MENU } from "@/components/navbars/financial-services-menu";
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

  it("gives exactly one item a mega-menu, and it is Financial Services", () => {
    const withMenu = NAV_ITEMS.filter((item) => item.menu);
    expect(withMenu).toHaveLength(1);
    expect(withMenu[0]?.label).toBe("Financial Services");
  });

  it("wires the Financial Services menu to FINANCIAL_SERVICES_MENU, not a hand-duplicated copy", () => {
    const finance = NAV_ITEMS.find((item) => item.label === "Financial Services");
    expect(finance?.menu?.columns).toBe(FINANCIAL_SERVICES_MENU);
  });

  it("gives every menu item an internal href", () => {
    const finance = NAV_ITEMS.find((item) => item.label === "Financial Services");
    for (const column of finance?.menu?.columns ?? []) {
      for (const group of column.groups) {
        for (const child of group.items) {
          expect(child.href.startsWith("/")).toBe(true);
        }
      }
    }
  });
});
