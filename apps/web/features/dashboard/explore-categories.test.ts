import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  EXPLORE_CATEGORIES,
  getExploreCategory,
  shouldSkipCardsCategoryList,
} from "./explore-categories";

// Locks the data contract the Explore hub, its sidebar accordion, and the
// [slug] category page are all built on (see explore-categories.ts's header
// comment for why `icon` and `illustration` both stay on every entry).

const WEB_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PUBLIC_DIR = join(WEB_ROOT, "public");

describe("EXPLORE_CATEGORIES", () => {
  it("orders the hub as Loans, Insurance, Credit Cards", () => {
    expect(EXPLORE_CATEGORIES.map((c) => c.slug)).toEqual(["loans", "insurance", "cards"]);
  });

  it("has unique, slug-shaped ids", () => {
    const slugs = EXPLORE_CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("maps every category to the ProductCategory the public catalogue filters on", () => {
    const byCategory: Record<string, string> = {
      loans: "loan",
      insurance: "insurance",
      cards: "credit_card",
    };
    for (const category of EXPLORE_CATEGORIES) {
      expect(category.category).toBe(byCategory[category.slug]);
    }
  });

  it("points every illustration at a file that exists on disk", () => {
    for (const category of EXPLORE_CATEGORIES) {
      const relative = category.illustration.replace(/^\//, "");
      const path = join(PUBLIC_DIR, relative);
      expect(existsSync(path), `missing illustration: ${category.illustration}`).toBe(true);
    }
  });

  it("resolves categories by slug and returns undefined for an unknown one", () => {
    expect(getExploreCategory("loans")?.label).toBe("Loans");
    expect(getExploreCategory("not-a-real-category")).toBeUndefined();
  });
});

describe("shouldSkipCardsCategoryList", () => {
  it("skips the list for the cards category whenever it has at least one product", () => {
    expect(shouldSkipCardsCategoryList("cards", 1)).toBe(true);
    expect(shouldSkipCardsCategoryList("cards", 2)).toBe(true);
    expect(shouldSkipCardsCategoryList("cards", 0)).toBe(false);
    expect(shouldSkipCardsCategoryList("loans", 1)).toBe(false);
  });
});
