import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CATEGORY_ARTWORK_SUBTYPE,
  isReraVerified,
  PROPERTY_SUBTYPE_ARTWORK,
  resolvePropertyArtwork,
} from "./property-artwork";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC_DIR = join(WEB_ROOT, "public");

describe("property artwork", () => {
  it("ships an image for every generated-contract subtype", () => {
    expect(Object.keys(PROPERTY_SUBTYPE_ARTWORK)).toHaveLength(9);
    for (const src of Object.values(PROPERTY_SUBTYPE_ARTWORK)) {
      expect(existsSync(join(PUBLIC_DIR, src.replace(/^\//, ""))), `missing artwork: ${src}`).toBe(true);
    }
  });

  it("uses a submitted image before a subtype or category fallback", () => {
    expect(
      resolvePropertyArtwork({
        image: "https://cdn.example.test/approved.jpg",
        propertySubtype: "villa",
        category: "villas",
      }),
    ).toEqual({ src: "https://cdn.example.test/approved.jpg", isFallback: false });
  });

  it("uses the subtype image and supports legacy category-only rows", () => {
    expect(resolvePropertyArtwork({ propertySubtype: "farmland", category: "plots" })).toEqual({
      src: PROPERTY_SUBTYPE_ARTWORK.farmland,
      isFallback: true,
    });
    expect(resolvePropertyArtwork({ category: "commercial" })).toEqual({
      src: PROPERTY_SUBTYPE_ARTWORK[CATEGORY_ARTWORK_SUBTYPE.commercial],
      isFallback: true,
    });
  });

  it("reserves the RERA presentation for reviewed verified listings", () => {
    expect(isReraVerified("verified")).toBe(true);
    expect(isReraVerified("exemption_verified")).toBe(false);
    expect(isReraVerified("mismatch")).toBe(false);
    expect(isReraVerified("not_reviewed")).toBe(false);
  });
});
