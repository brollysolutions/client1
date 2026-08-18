import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CATEGORIES = {
  homepage: ["loans", "offers", "general", "properties", "referrals", "core-concepts"],
  homepage_ad: ["sponsor"],
  financial_services: [
    "personal-loan",
    "business-loan",
    "home-loan",
    "loan-against-property",
    "car-loan",
    "vehicle-loan",
    "education-loan",
    "school-funding",
    "secured-loans",
    "od-and-dod",
    "project-funding",
    "life-insurance",
    "health-insurance",
    "property-insurance",
    "travel-insurance",
    "credit-cards",
  ],
  properties: [
    "individual-house",
    "standalone-apartment",
    "gated-community-apartment",
    "villa",
    "locked-space",
    "unlocked-space",
    "plot",
    "farmland",
    "agriland",
    "apartments",
    "houses",
    "villas",
    "plots-land",
    "commercial",
    "offers",
    "guidance-general",
  ],
} as const;

// Explicit per-placement geometry, deliberately not a ternary: a ternary
// silently drops a new placement into the else-branch and then demands the
// wrong artwork size. Indexing this map means a new placement fails loudly.
const EXPECTED_SIZE: Record<keyof typeof CATEGORIES, { width: number; height: number }> = {
  homepage: { width: 1440, height: 800 },
  homepage_ad: { width: 1440, height: 360 },
  financial_services: { width: 1440, height: 576 },
  properties: { width: 1440, height: 576 },
};

function webpSize(bytes: Buffer): { width: number; height: number } {
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8 ") {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === "VP8X") {
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3),
    };
  }
  throw new Error(`Unsupported WEBP chunk ${chunk}`);
}

describe("bundled banner template artwork", () => {
  it("contains one bounded, placement-sized WEBP for each governed category", () => {
    const files = Object.entries(CATEGORIES).flatMap(([placement, categories]) =>
      categories.map((category) => ({
        file: join(process.cwd(), "public", "banner-templates", placement, `${category}.webp`),
        expectedSize: EXPECTED_SIZE[placement as keyof typeof CATEGORIES],
      })),
    );
    expect(files).toHaveLength(39);
    for (const { file, expectedSize } of files) {
      expect(statSync(file).size).toBeGreaterThan(0);
      expect(statSync(file).size).toBeLessThanOrEqual(2 * 1024 * 1024);
      const bytes = readFileSync(file);
      expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
      expect(bytes.toString("ascii", 8, 12)).toBe("WEBP");
      expect(webpSize(bytes)).toEqual(expectedSize);
    }
  });
});
