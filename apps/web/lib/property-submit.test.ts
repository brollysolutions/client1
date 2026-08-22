import { describe, expect, it } from "vitest";

import {
  buildSubmissionPayload,
  validateForm,
  EMPTY_DETAILS,
  EMPTY_FORM,
  FURNISHING_OPTIONS,
  CONSTRUCTION_OPTIONS,
  type SubmitFormState,
} from "@/lib/property-submit";

const PROJECT_AMENITIES = Array.from({ length: 150 }, () => "landscaped").join(" ");

const VALID: SubmitFormState = {
  ...EMPTY_FORM,
  title: "  Sunny 2BHK  ",
  type: "Apartment",
  location: "Kondapur, Hyderabad",
  city: "Hyderabad",
  locality: "Kondapur",
  state: "Telangana",
  pincode: "500084",
  priceRupees: "5000000",
  propertySubtype: "standalone_apartment",
  furnishing: "semi",
  constructionStatus: "ready",
  reraApplicability: "applicable",
  reraNumber: "TS-RERA-123",
  amenities: ["parking", "lift"],
  details: {
    ...EMPTY_DETAILS,
    projectName: "Sunny Homes",
    projectAreaAcres: "4.5",
    numberOfTowers: "3",
    totalUnits: "120",
    configurations: ["2_bhk", "3_bhk"],
    unitAreaSqft: "1150",
    rateRupees: "6500",
    saleType: "new_sale",
    facing: "east",
    amenitiesDescription: PROJECT_AMENITIES,
    about: "A calm community with landscaped gardens and generous shared spaces.",
  },
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

  it("derives the broad category from the selected property subtype", () => {
    const payload = buildSubmissionPayload(VALID, MEDIA);
    expect(payload.property_subtype).toBe("standalone_apartment");
    expect(payload.category).toBe("apartments");
  });

  it("rounds fractional rupees to whole paise", () => {
    expect(buildSubmissionPayload({ ...VALID, priceRupees: "1234.55" }, MEDIA).price_paise).toBe(123455);
  });

  it("trims strings and coerces numeric fields", () => {
    const p = buildSubmissionPayload(VALID, MEDIA);
    expect(p.title).toBe("Sunny 2BHK");
    expect(p.bhk).toBe(0);
    expect(p.area_sqft).toBe(1150);
    expect(p.age_years).toBe(0);
  });

  it("builds the closed project-residence payload", () => {
    const p = buildSubmissionPayload(VALID, MEDIA);
    expect(p.structured_details).toMatchObject({
      kind: "project_residence",
      project_name: "Sunny Homes",
      unit_or_plot_area_sqft: 1150,
      price_per_sqft_paise: 650_000,
      configurations: ["2_bhk", "3_bhk"],
    });
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

  it("requires at least 150 words for project amenities", () => {
    const details = {
      ...VALID.details,
      amenitiesDescription: Array.from({ length: 149 }, () => "landscaped").join(" "),
    };

    expect(validateForm({ ...VALID, details }).amenitiesDescription).toContain("at least 150 words");
  });

  it("flags a non-6-digit pincode", () => {
    expect(validateForm({ ...VALID, pincode: "5008" }).pincode).toBeTruthy();
  });

  it("flags a zero or missing price", () => {
    expect(validateForm({ ...VALID, priceRupees: "0" }).priceRupees).toBeTruthy();
    expect(validateForm({ ...VALID, priceRupees: "" }).priceRupees).toBeTruthy();
  });

  it("flags missing required text fields", () => {
    const errs = validateForm({
      ...VALID,
      title: "  ",
      propertySubtype: "",
    });
    expect(errs.title).toBeTruthy();
    expect(errs.propertySubtype).toBeTruthy();
  });

  it("accepts a blank optional RERA number", () => {
    expect(validateForm({ ...VALID, reraNumber: "" })).toEqual({});
    expect(buildSubmissionPayload({ ...VALID, reraNumber: "" }, MEDIA).rera_number).toBeNull();
  });

  it("rejects numbers and links in public narrative fields", () => {
    expect(
      validateForm({
        ...VALID,
        details: { ...VALID.details, about: "Call 9876543210" },
      }).about,
    ).toBeTruthy();
    expect(
      validateForm({
        ...VALID,
        details: { ...VALID.details, about: "Visit example.xyz" },
      }).about,
    ).toBeTruthy();
    expect(
      validateForm({
        ...VALID,
        details: { ...VALID.details, about: "Use ftp://example" },
      }).about,
    ).toBeTruthy();
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
    expect(
      validateForm({
        ...VALID,
        panorama: new File(["gif"], "tour.gif", { type: "image/gif" }),
      }).panorama,
    ).toBeTruthy();
  });
});

describe("option lists match the backend enums", () => {
  it("furnishing and construction match the backend enums", () => {
    expect(FURNISHING_OPTIONS.map((o) => o.value).sort()).toEqual(["furnished", "semi", "unfurnished"]);
    expect(CONSTRUCTION_OPTIONS.map((o) => o.value).sort()).toEqual(["ready", "under_construction"]);
  });
});
