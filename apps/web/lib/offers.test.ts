import { describe, expect, it } from "vitest";

import { formatDiscount, offersForLine, type PublicOffer } from "@/lib/offers";

describe("formatDiscount()", () => {
  it("formats a percentage", () => {
    expect(formatDiscount("percentage", "15")).toBe("15% off");
  });

  it("normalizes trailing decimal zeros on a percentage", () => {
    expect(formatDiscount("percentage", "10.00")).toBe("10% off");
  });

  it("keeps a real fraction on a percentage", () => {
    expect(formatDiscount("percentage", "12.50")).toBe("12.5% off");
  });

  it("formats a flat rupee discount with en-IN grouping", () => {
    expect(formatDiscount("flat", "5000")).toBe("₹5,000 off");
  });

  it("formats a flat rupee discount at lakh scale", () => {
    expect(formatDiscount("flat", "100000")).toBe("₹1,00,000 off");
  });

  it("formats a cashback-tie discount with a value", () => {
    expect(formatDiscount("cashback-tie", "5000")).toBe("₹5,000 cashback");
  });

  it("formats a zero-value cashback-tie discount as a generic label", () => {
    expect(formatDiscount("cashback-tie", "0")).toBe("Cashback offer");
  });

  it("returns undefined for an unrecognized discount_type", () => {
    expect(formatDiscount("mystery", "10")).toBeUndefined();
  });

  it("returns undefined for a non-numeric discount_value", () => {
    expect(formatDiscount("flat", "abc")).toBeUndefined();
  });

  it("returns undefined for an empty discount_value (Number('') is 0, not NaN)", () => {
    expect(formatDiscount("flat", "")).toBeUndefined();
  });

  it("returns undefined for a negative discount_value", () => {
    expect(formatDiscount("flat", "-5")).toBeUndefined();
  });
});

function offer(overrides: Partial<PublicOffer> = {}): PublicOffer {
  return {
    id: "id",
    line: "loans",
    title: "Offer",
    ...overrides,
  };
}

describe("offersForLine()", () => {
  it("includes an offer matching the requested line", () => {
    const result = offersForLine([offer({ id: "a", line: "loans" })], "loans");
    expect(result.map((o) => o.id)).toEqual(["a"]);
  });

  it("includes a 'both' offer on the loans strip", () => {
    const result = offersForLine([offer({ id: "a", line: "both" })], "loans");
    expect(result.map((o) => o.id)).toEqual(["a"]);
  });

  it("excludes a real_estate offer from the loans strip", () => {
    const result = offersForLine([offer({ id: "a", line: "real_estate" })], "loans");
    expect(result).toEqual([]);
  });

  it("includes real_estate and both on the real_estate strip, excludes loans", () => {
    const offers = [
      offer({ id: "a", line: "real_estate" }),
      offer({ id: "b", line: "both" }),
      offer({ id: "c", line: "loans" }),
    ];
    const result = offersForLine(offers, "real_estate");
    expect(result.map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("excludes an unrecognized business_line value (allowlist, not a negation)", () => {
    const result = offersForLine([offer({ id: "a", line: "future_value" })], "loans");
    expect(result).toEqual([]);
  });

  it("preserves input order", () => {
    const offers = [
      offer({ id: "newer", line: "loans" }),
      offer({ id: "older", line: "loans" }),
    ];
    const result = offersForLine(offers, "loans");
    expect(result.map((o) => o.id)).toEqual(["newer", "older"]);
  });

  it("returns an empty array for empty input", () => {
    expect(offersForLine([], "loans")).toEqual([]);
  });
});
