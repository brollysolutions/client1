import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { LOAN_PRODUCT_BANDS, LOAN_PRODUCTS, LOAN_TRUST } from "@/lib/products";

// Locks the data contract that both /loans (via ProductPage) and the navbar
// mega-menu (via components/navbars/financial-services-menu.ts) are built on.
// See lib/products.ts's header comment and .agent-workflow/DECISIONS.md for
// why this list grew from 7 to 16 products.

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC_DIR = join(WEB_ROOT, "public");

describe("LOAN_PRODUCTS", () => {
  it("has unique, slug-shaped ids", () => {
    const ids = LOAN_PRODUCTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("gives every product a known group, with the approved 11/4/1 split", () => {
    const counts = { loans: 0, insurance: 0, "credit-cards": 0 };
    for (const product of LOAN_PRODUCTS) {
      expect(counts).toHaveProperty(product.group);
      counts[product.group] += 1;
    }
    expect(counts).toEqual({ loans: 11, insurance: 4, "credit-cards": 1 });
  });

  it("preserves the retired property-loan anchor on home-loan, and only there", () => {
    const homeLoan = LOAN_PRODUCTS.find((p) => p.id === "home-loan");
    expect(homeLoan?.legacyAnchorId).toBe("property-loan");
    expect(LOAN_PRODUCTS.some((p) => p.id === "property-loan")).toBe(false);

    const legacyIds = LOAN_PRODUCTS.filter((p) => p.legacyAnchorId).map(
      (p) => p.legacyAnchorId,
    );
    // "insurance" is reserved for the LOAN_PRODUCT_BANDS section anchor below,
    // not a product-level legacyAnchorId — a product claiming it would emit a
    // duplicate DOM id on /loans.
    expect(legacyIds).not.toContain("insurance");
  });

  it("has no two products sharing a description, including the Car/Vehicle pair", () => {
    const descriptions = LOAN_PRODUCTS.map((p) => p.description);
    expect(new Set(descriptions).size).toBe(descriptions.length);

    const car = LOAN_PRODUCTS.find((p) => p.id === "car-loan");
    const vehicle = LOAN_PRODUCTS.find((p) => p.id === "vehicle-loan");
    expect(car?.description.toLowerCase()).toContain("car");
    expect(vehicle?.description.toLowerCase()).toContain("two-wheeler");
    expect(vehicle?.description.toLowerCase()).toContain("commercial");
    expect(car?.description).not.toBe(vehicle?.description);
  });

  it("follows the no em/en dash content rule in labels and descriptions", () => {
    for (const product of LOAN_PRODUCTS) {
      expect(product.label).not.toMatch(/[—–]/);
      expect(product.description).not.toMatch(/[—–]/);
    }
  });

  it("points every illustration at a file that exists on disk", () => {
    for (const product of LOAN_PRODUCTS) {
      if (!product.illustration) continue;
      const relative = product.illustration.replace(/^\//, "");
      const path = join(PUBLIC_DIR, relative);
      expect(existsSync(path), `missing illustration: ${product.illustration}`).toBe(
        true,
      );
    }
  });
});

describe("LOAN_PRODUCT_BANDS", () => {
  it("keeps the requested category descriptions out of the Loans page", () => {
    expect(LOAN_PRODUCT_BANDS.map((band) => band.description)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("never uses a band id that collides with a product id", () => {
    const productIds = new Set(LOAN_PRODUCTS.map((p) => p.id));
    for (const band of LOAN_PRODUCT_BANDS) {
      expect(productIds.has(band.id)).toBe(false);
    }
  });

  it("covers every product exactly once", () => {
    const bandedIds = LOAN_PRODUCT_BANDS.flatMap((band) =>
      band.products.map((p) => p.id),
    );
    expect(bandedIds.length).toBe(LOAN_PRODUCTS.length);
    expect(new Set(bandedIds).size).toBe(LOAN_PRODUCTS.length);
    expect(new Set(bandedIds)).toEqual(new Set(LOAN_PRODUCTS.map((p) => p.id)));
  });

  it("points featureProductId at a product that belongs to the same band", () => {
    for (const band of LOAN_PRODUCT_BANDS) {
      if (!band.featureProductId) continue;
      expect(band.products.map((p) => p.id)).toContain(band.featureProductId);
    }
  });

  it("features Credit Cards in the insurance band so its grid holds the four insurance products", () => {
    const insurance = LOAN_PRODUCT_BANDS.find((b) => b.id === "insurance");
    expect(insurance?.featureProductId).toBe("credit-cards");
    expect(
      insurance?.products.filter((p) => p.id !== insurance.featureProductId)
        .length,
    ).toBe(4);
  });

  it("keeps LOAN_TRUST as the three-point section-level trust content", () => {
    // /loans passes this to ProductPage's productsTrust, which renders the
    // TrustStrip below the whole products grid (moved out of the insurance
    // band per direct user feedback).
    expect(LOAN_TRUST).toHaveLength(3);
    for (const point of LOAN_TRUST) {
      expect(point.label.length).toBeGreaterThan(0);
      expect(point.note.length).toBeGreaterThan(0);
    }
  });
});
