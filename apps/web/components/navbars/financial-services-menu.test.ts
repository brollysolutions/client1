import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  FINANCIAL_SERVICES_MENU,
  FINANCIAL_SERVICES_OVERVIEW,
} from "@/components/navbars/financial-services-menu";
import { PROPERTIES_MENU } from "@/components/navbars/properties-menu";
import { LOAN_PRODUCTS } from "@/lib/products";

const PUBLIC_DIR = join(fileURLToPath(new URL("../..", import.meta.url)), "public");

// Regression coverage for the navbar mega-menu join in
// financial-services-menu.ts. Unlike footer-links.ts's id-lookup risk (a
// dropped link), this join filters by group, so the risk here is the
// opposite: a product added to lib/products.ts without a group, or a group
// this file doesn't know about, silently vanishes from the nav.

function allGroups() {
  return FINANCIAL_SERVICES_MENU.flatMap((column) => column.groups);
}

describe("FINANCIAL_SERVICES_MENU", () => {
  it("every item href resolves to a real product anchor", () => {
    for (const group of allGroups()) {
      for (const item of group.items) {
        const id = item.href.replace("/loans#", "");
        expect(item.href.startsWith("/loans#")).toBe(true);
        expect(LOAN_PRODUCTS.some((p) => p.id === id)).toBe(true);
      }
    }
  });

  it("every product appears in the menu exactly once", () => {
    const menuIds = allGroups().flatMap((group) =>
      group.items.map((item) => item.href.replace("/loans#", "")),
    );
    expect(menuIds.length).toBe(LOAN_PRODUCTS.length);
    expect(new Set(menuIds).size).toBe(LOAN_PRODUCTS.length);
    expect(new Set(menuIds)).toEqual(new Set(LOAN_PRODUCTS.map((p) => p.id)));
  });

  it("has the approved 2-column structure: Loans alone, Insurance + Credit Cards stacked", () => {
    expect(FINANCIAL_SERVICES_MENU).toHaveLength(2);
    expect(FINANCIAL_SERVICES_MENU[0]?.groups.map((g) => g.heading)).toEqual([
      "Loans",
    ]);
    expect(FINANCIAL_SERVICES_MENU[1]?.groups.map((g) => g.heading)).toEqual([
      "Insurance",
      "Credit Cards",
    ]);
  });

  it("has the approved 11/4/1 group item counts", () => {
    expect(allGroups().map((g) => g.items.length)).toEqual([11, 4, 1]);
  });

  it("has no duplicate hrefs across groups", () => {
    const hrefs = allGroups().flatMap((g) => g.items.map((i) => i.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("gives every item a non-empty label and an icon", () => {
    for (const group of allGroups()) {
      for (const item of group.items) {
        expect(item.label.trim()).toBeTruthy();
        expect(item.icon).toBeDefined();
      }
    }
  });

  it("gives every item a miniature illustration that exists on disk", () => {
    for (const group of allGroups()) {
      for (const item of group.items) {
        expect(item.illustration, `${item.label} has no illustration`).toBeTruthy();
        const path = join(PUBLIC_DIR, item.illustration!.replace(/^\//, ""));
        expect(existsSync(path), `missing thumbnail: ${item.illustration}`).toBe(true);
      }
    }
  });

  it("uses each product's navLabel (falling back to label)", () => {
    for (const group of allGroups()) {
      for (const item of group.items) {
        const id = item.href.replace("/loans#", "");
        const product = LOAN_PRODUCTS.find((p) => p.id === id);
        expect(item.label).toBe(product?.navLabel ?? product?.label);
      }
    }
  });
});

describe("PROPERTIES_MENU", () => {
  it("gives every subtype item a miniature illustration that exists on disk", () => {
    const items = PROPERTIES_MENU.flatMap((column) =>
      column.groups.flatMap((group) => group.items),
    );
    expect(items.length).toBe(9);
    for (const item of items) {
      expect(item.illustration, `${item.label} has no illustration`).toBeTruthy();
      const path = join(PUBLIC_DIR, item.illustration!.replace(/^\//, ""));
      expect(existsSync(path), `missing thumbnail: ${item.illustration}`).toBe(true);
    }
  });
});

describe("FINANCIAL_SERVICES_OVERVIEW", () => {
  it("points at the loans hub", () => {
    expect(FINANCIAL_SERVICES_OVERVIEW).toEqual({
      label: "View all financial services",
      href: "/loans",
    });
  });
});
