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

const RENT: SubmitFormState = {
  ...VALID,
  listingIntent: "rent",
  priceRupees: "25000",
  securityDepositRupees: "150000",
  minimumLeaseMonths: "11",
  details: { ...VALID.details, saleType: "" },
};

describe("listing intent", () => {
  it("defaults a new form to a sale listing", () => {
    expect(EMPTY_FORM.listingIntent).toBe("sale");
  });

  it("accepts a rent listing with deposit and minimum term", () => {
    expect(validateForm(RENT, { requireImages: false })).toEqual({});
  });

  it("sends the rent terms and drops the sale type", () => {
    const payload = buildSubmissionPayload(RENT, []);

    expect(payload.listing_intent).toBe("rent");
    expect(payload.price_paise).toBe(2_500_000);
    expect(payload.security_deposit_paise).toBe(15_000_000);
    expect(payload.minimum_lease_months).toBe(11);
    expect(payload.structured_details).toMatchObject({ sale_type: null });
  });

  it.each([
    ["securityDepositRupees", "security deposit"],
    ["minimumLeaseMonths", "minimum lease duration"],
  ])("requires %s on a rent listing", (field, label) => {
    const errors = validateForm({ ...RENT, [field]: "" }, { requireImages: false });
    expect(errors[field]).toMatch(new RegExp(label));
  });

  it("does not require a sale type on a rent listing", () => {
    const errors = validateForm(RENT, { requireImages: false });
    expect(errors.saleType).toBeUndefined();
  });

  it("still requires a sale type on a sale listing", () => {
    const errors = validateForm(
      { ...VALID, details: { ...VALID.details, saleType: "" } },
      { requireImages: false },
    );
    expect(errors.saleType).toMatch(/Sale type/);
  });

  it("nulls the rent terms when the listing is switched back to sale", () => {
    // The author flips the toggle back without clearing the deposit they typed.
    // The payload must not carry it, or the API rejects the whole submission.
    const payload = buildSubmissionPayload({ ...RENT, listingIntent: "sale" }, []);

    expect(payload.security_deposit_paise).toBeNull();
    expect(payload.minimum_lease_months).toBeNull();
    expect(payload.available_from).toBeNull();
  });
});

describe("listing links", () => {
  it("omits the field entirely when no link was entered", () => {
    expect(buildSubmissionPayload({ ...VALID, listingLinks: ["", "  "] }, []).listing_links).toBeNull();
  });

  it("sends only the URL and lets the server derive the platform", () => {
    const payload = buildSubmissionPayload(
      { ...VALID, listingLinks: [" https://youtu.be/abc ", ""] },
      [],
    );

    expect(payload.listing_links).toEqual([{ url: "https://youtu.be/abc" }]);
  });

  it("reports an off-allowlist link against its own row", () => {
    const errors = validateForm(
      { ...VALID, listingLinks: ["https://youtu.be/abc", "https://phish.example/x"] },
      { requireImages: false },
    );

    expect(errors["listingLink-0"]).toBeUndefined();
    expect(errors["listingLink-1"]).toMatch(/YouTube, Instagram, or Facebook/);
  });

  it("rejects more than four links", () => {
    const errors = validateForm(
      {
        ...VALID,
        listingLinks: Array.from({ length: 5 }, (_, index) => `https://youtu.be/abc${index}`),
      },
      { requireImages: false },
    );

    expect(errors.listingLinks).toMatch(/at most 4/);
  });
});
