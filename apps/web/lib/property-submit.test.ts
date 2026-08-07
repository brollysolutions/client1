import { describe, expect, it } from "vitest";

import {
  buildSubmissionPayload,
  validateForm,
  EMPTY_FORM,
  CATEGORY_OPTIONS,
  FURNISHING_OPTIONS,
  CONSTRUCTION_OPTIONS,
  type SubmitFormState,
} from "@/lib/property-submit";

const VALID: SubmitFormState = {
  ...EMPTY_FORM,
  title: "  Sunny 2BHK  ",
  type: "Apartment",
  location: "Kondapur, Hyderabad",
  city: "Hyderabad",
  locality: "Kondapur",
  pincode: "500084",
  priceRupees: "5000000",
  category: "apartments",
  furnishing: "semi",
  constructionStatus: "ready",
  rera_number: "TS-RERA-123",
  bhk: "2",
  area_sqft: "1150",
  age_years: "3",
  amenities: ["parking", "lift"],
  details: [{ key: "facing", value: "East" }, { key: "floor", value: "7" }],
  images: [new File(["image"], "a.jpg", { type: "image/jpeg" })],
  documents: [],
  meta: "Ready to move",
};

const MEDIA = [
  {
    kind: "image" as const,
    content_type: "image/jpeg" as const,
    object_key:
      "private/property-submissions/staging/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002/asset.jpg",
    position: 0,
  },
];

describe("buildSubmissionPayload()", () => {
  it("converts rupees to integer paise (x100)", () => {
    const p = buildSubmissionPayload(VALID, MEDIA);
    expect(p.price_paise).toBe(500_000_000);
    expect(Number.isInteger(p.price_paise)).toBe(true);
  });

  it("rounds fractional rupees to whole paise", () => {
    expect(buildSubmissionPayload({ ...VALID, priceRupees: "1234.55" }, MEDIA).price_paise).toBe(123455);
  });

  it("trims strings and coerces numeric fields", () => {
    const p = buildSubmissionPayload(VALID, MEDIA);
    expect(p.title).toBe("Sunny 2BHK");
    expect(p.bhk).toBe(2);
    expect(p.area_sqft).toBe(1150);
    expect(p.age_years).toBe(3);
  });

  it("assembles details rows into an object, dropping blank keys", () => {
    const p = buildSubmissionPayload({
      ...VALID,
      details: [{ key: "facing", value: "East" }, { key: "", value: "ignored" }],
    }, MEDIA);
    expect(p.details).toEqual({ facing: "East" });
  });

  it("passes amenities through and omits empty optional strings as null", () => {
    const p = buildSubmissionPayload({ ...VALID, meta: "" }, MEDIA);
    expect(p.amenities).toEqual(["parking", "lift"]);
    expect(p.meta).toBeNull();
    expect(p.media).toEqual(MEDIA);
  });
});

describe("validateForm()", () => {
  it("accepts a complete valid form", () => {
    expect(validateForm(VALID)).toEqual({});
  });

  it("flags a non-6-digit pincode", () => {
    expect(validateForm({ ...VALID, pincode: "5008" }).pincode).toBeTruthy();
  });

  it("flags a zero or missing price", () => {
    expect(validateForm({ ...VALID, priceRupees: "0" }).priceRupees).toBeTruthy();
    expect(validateForm({ ...VALID, priceRupees: "" }).priceRupees).toBeTruthy();
  });

  it("flags missing required text fields", () => {
    const errs = validateForm({ ...VALID, title: "  ", rera_number: "" });
    expect(errs.title).toBeTruthy();
    expect(errs.rera_number).toBeTruthy();
  });

  it("requires managed images and rejects unsupported media", () => {
    expect(validateForm({ ...VALID, images: [] }).images).toBeTruthy();
    expect(
      validateForm({
        ...VALID,
        images: [new File(["gif"], "bad.gif", { type: "image/gif" })],
      }).images,
    ).toBeTruthy();
    expect(
      validateForm({
        ...VALID,
        documents: [new File(["text"], "note.txt", { type: "text/plain" })],
      }).documents,
    ).toBeTruthy();
  });
});

describe("option lists match the backend enums", () => {
  it("category covers all five backend values", () => {
    expect(CATEGORY_OPTIONS.map((o) => o.value).sort()).toEqual(
      ["apartments", "commercial", "houses", "plots", "villas"],
    );
  });
  it("furnishing and construction match the backend enums", () => {
    expect(FURNISHING_OPTIONS.map((o) => o.value).sort()).toEqual(["furnished", "semi", "unfurnished"]);
    expect(CONSTRUCTION_OPTIONS.map((o) => o.value).sort()).toEqual(["ready", "under_construction"]);
  });
});
