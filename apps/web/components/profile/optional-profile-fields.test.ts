import { describe, expect, it } from "vitest";

import {
  EMPTY_OPTIONAL_PROFILE,
  formatApproximateLocation,
  optionalProfilePayload,
} from "@/components/profile/optional-profile-fields";

describe("optionalProfilePayload", () => {
  it("maps an empty optional profile to explicit nulls", () => {
    const result = optionalProfilePayload(EMPTY_OPTIONAL_PROFILE);
    expect(result).toEqual({
      ok: true,
      data: {
        gender: null,
        genderSelfDescription: null,
        incomeSource: null,
        incomeAmountMinor: null,
        incomePeriod: null,
        occupation: null,
        location: null,
      },
    });
  });

  it("converts rupees to integer minor units", () => {
    const result = optionalProfilePayload({
      ...EMPTY_OPTIONAL_PROFILE,
      incomeSource: "salaried",
      incomeAmountRupees: "50000.25",
      incomePeriod: "monthly",
    });
    expect(result.ok && result.data.incomeAmountMinor).toBe(5_000_025);
  });

  it("keeps a trimmed manual location", () => {
    const result = optionalProfilePayload({
      ...EMPTY_OPTIONAL_PROFILE,
      location: "  Kondapur, Hyderabad  ",
    });
    expect(result.ok && result.data.location).toBe("Kondapur, Hyderabad");
  });

  it("requires a description for self-described gender", () => {
    const result = optionalProfilePayload({
      ...EMPTY_OPTIONAL_PROFILE,
      gender: "self_described",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects malformed and out-of-range income", () => {
    expect(
      optionalProfilePayload({
        ...EMPTY_OPTIONAL_PROFILE,
        incomeSource: "business_income",
        incomeAmountRupees: "12.345",
        incomePeriod: "annual",
      }).ok,
    ).toBe(false);
    expect(
      optionalProfilePayload({
        ...EMPTY_OPTIONAL_PROFILE,
        incomeSource: "business_income",
        incomeAmountRupees: "10000000000.01",
        incomePeriod: "annual",
      }).ok,
    ).toBe(false);
  });
});

describe("formatApproximateLocation", () => {
  it("rounds device coordinates to two decimals and adds hemispheres", () => {
    expect(formatApproximateLocation(17.3851, 78.4867)).toBe("17.39° N, 78.49° E");
    expect(formatApproximateLocation(-33.8688, -151.2093)).toBe("33.87° S, 151.21° W");
  });
});
