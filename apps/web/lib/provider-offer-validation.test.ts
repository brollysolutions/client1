import { describe, expect, it } from "vitest";

import {
  validateProviderOfferDraft,
  type ProviderOfferDraftValues,
} from "@/lib/provider-offer-validation";

const validDraft: ProviderOfferDraftValues = {
  productId: "product-id",
  providerId: "provider-id",
  name: "Preferred offer",
  summary: "",
  order: "1000",
  minAmount: "100000.00",
  maxAmount: "500000.00",
  minRate: "8.125",
  maxRate: "12.500",
  minTenure: "12",
  maxTenure: "60",
  processingFee: "",
  eligibility: "",
  verifiedOn: "2026-08-27",
  published: true,
};

describe("validateProviderOfferDraft", () => {
  it("accepts API-compatible terms", () => {
    expect(validateProviderOfferDraft(validDraft, new Date("2026-08-27T12:00:00Z"))).toEqual({});
  });

  it("rejects missing identity, invalid precision, and reversed ranges", () => {
    const errors = validateProviderOfferDraft(
      {
        ...validDraft,
        productId: "",
        providerId: "",
        minAmount: "100.001",
        minRate: "20",
        maxRate: "10",
        minTenure: "12.5",
      },
      new Date("2026-08-27T12:00:00Z"),
    );

    expect(errors).toMatchObject({
      productId: "Financial product is required.",
      providerId: "Provider is required.",
      minAmount: "Minimum amount must use no more than 2 decimal places.",
      maxRate: "Maximum interest rate cannot be below minimum interest rate.",
      minTenure: "Minimum tenure must be a whole number.",
    });
  });

  it("requires a non-future verification date for published offers", () => {
    expect(
      validateProviderOfferDraft(
        { ...validDraft, verifiedOn: "" },
        new Date("2026-08-27T12:00:00Z"),
      ).verifiedOn,
    ).toBe("Verification date is required.");
    expect(
      validateProviderOfferDraft(
        { ...validDraft, verifiedOn: "2026-08-28" },
        new Date("2026-08-27T12:00:00Z"),
      ).verifiedOn,
    ).toBe("Verification date cannot be in the future.");
  });
});
