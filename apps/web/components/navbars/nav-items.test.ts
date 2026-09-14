import { describe, expect, it } from "vitest";

import { CALCULATORS_MENU } from "@/components/navbars/calculators-menu";
import { FINANCIAL_SERVICES_MENU } from "@/components/navbars/financial-services-menu";
import { NAV_ITEMS } from "@/components/navbars/nav-items";
import { PROPERTIES_MENU } from "@/components/navbars/properties-menu";
import { CALCULATORS } from "@/lib/calculators/registry";

// The public header and mobile drawer both render from NAV_ITEMS. The
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

  it("gives Financial Services, Properties and Calculators governed mega-menus", () => {
    const withMenu = NAV_ITEMS.filter((item) => item.menu);
    expect(withMenu.map((item) => item.label)).toEqual(["Financial Services", "Properties", "Calculators"]);
  });

  it("places Calculators before Earn with Us and links every registered calculator exactly once", () => {
    const index = NAV_ITEMS.findIndex((item) => item.href === "/calculators");
    expect(NAV_ITEMS[index + 1].href).toBe("/earn-with-us");
    expect(NAV_ITEMS[index].menu?.columns).toBe(CALCULATORS_MENU);
    const groups = CALCULATORS_MENU.flatMap((column) => column.groups);
    const links = groups.flatMap((group) => group.items);
    expect(links).toHaveLength(CALCULATORS.length);
    expect(new Set(links.map((item) => item.href)).size).toBe(CALCULATORS.length);
    for (const calculator of CALCULATORS) {
      const group = groups.find((item) => item.key === `calculator-${calculator.group}`);
      expect(group?.items.find((item) => item.href === `/calculators/${calculator.slug}`)).toMatchObject({ label: calculator.navLabel });
    }
    for (const item of links) {
      expect(item.icon).toBeDefined();
      expect(item.illustration).toBeUndefined();
    }
  });

  it("wires the Financial Services menu to FINANCIAL_SERVICES_MENU, not a hand-duplicated copy", () => {
    const finance = NAV_ITEMS.find((item) => item.label === "Financial Services");
    expect(finance?.menu?.columns).toBe(FINANCIAL_SERVICES_MENU);
  });

  it("wires the Properties menu to all nine governed property subtypes", () => {
    const properties = NAV_ITEMS.find((item) => item.label === "Properties");
    expect(properties?.menu?.columns).toBe(PROPERTIES_MENU);
    const items = PROPERTIES_MENU.flatMap((column) => column.groups.flatMap((group) => group.items));
    expect(items).toHaveLength(9);
    expect(items.every((item) => item.href.startsWith("/real-estate?property_type="))).toBe(true);
  });

  it("gives every menu item an internal href", () => {
    for (const item of NAV_ITEMS) {
      for (const column of item.menu?.columns ?? []) {
        for (const group of column.groups) {
          for (const child of group.items) {
            expect(child.href.startsWith("/")).toBe(true);
          }
        }
      }
    }
  });
});
