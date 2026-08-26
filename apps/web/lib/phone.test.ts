import { describe, expect, it } from "vitest";

import { formatMobile, isValidMobile, normalizeMobile, toE164 } from "./phone";

describe("normalizeMobile", () => {
  it("strips internal spaces from a pasted bare number", () => {
    expect(normalizeMobile("98765 43210")).toBe("9876543210");
  });

  it("strips a pasted +91-prefixed number with spaces", () => {
    expect(normalizeMobile("+91 98765 43210")).toBe("9876543210");
  });

  it("strips a pasted 0-prefixed 11-digit number", () => {
    expect(normalizeMobile("09876543210")).toBe("9876543210");
  });

  it("leaves an already-bare 10-digit number unchanged", () => {
    expect(normalizeMobile("9876543210")).toBe("9876543210");
  });

  it("does not misfire on a non-Indian-shaped 12-digit string", () => {
    // 12 digits not starting with "91" should not be treated as a country-code prefix.
    expect(normalizeMobile("123456789012")).toBe("123456789012");
  });
});

describe("isValidMobile", () => {
  it("accepts a valid pasted number with internal spaces", () => {
    expect(isValidMobile("98765 43210")).toBe(true);
  });

  it("accepts a valid pasted +91-prefixed number with spaces", () => {
    expect(isValidMobile("+91 98765 43210")).toBe(true);
  });

  it("rejects a number with an invalid leading digit", () => {
    expect(isValidMobile("5876543210")).toBe(false);
  });

  it("rejects a too-short number even after normalization", () => {
    expect(isValidMobile("987654")).toBe(false);
  });
});

describe("toE164", () => {
  it("prefixes a bare 10-digit number with +91", () => {
    expect(toE164("9876543210")).toBe("+919876543210");
  });
});

describe("formatMobile", () => {
  it("formats a bare number with the display grouping", () => {
    expect(formatMobile("9876543210")).toBe("+91 98765 43210");
  });

  it("falls back to the raw input when not a 10-digit number", () => {
    expect(formatMobile("123")).toBe("123");
  });
});
