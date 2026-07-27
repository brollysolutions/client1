import { describe, expect, it } from "vitest";

import {
  buildRegisterUrl,
  buildWaMeUrl,
  isValidReferralCodeFormat,
  normalizeReferralCode,
} from "@/lib/referral-share";

describe("buildRegisterUrl()", () => {
  it("appends ?ref= with the code", () => {
    expect(buildRegisterUrl("https://brolly.example", "AB12CD34")).toBe(
      "https://brolly.example/register?ref=AB12CD34",
    );
  });

  it("strips a trailing slash on the origin", () => {
    expect(buildRegisterUrl("https://brolly.example/", "AB12CD34")).toBe(
      "https://brolly.example/register?ref=AB12CD34",
    );
  });

  it("URL-encodes the code", () => {
    expect(buildRegisterUrl("https://brolly.example", "AB 12")).toBe(
      "https://brolly.example/register?ref=AB%2012",
    );
  });
});

describe("buildWaMeUrl()", () => {
  it("carries no destination number", () => {
    const url = buildWaMeUrl("https://brolly.example", "AB12CD34");
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
  });

  it("embeds the code and the register link in the message", () => {
    const url = buildWaMeUrl("https://brolly.example", "AB12CD34");
    const message = decodeURIComponent(url.replace("https://wa.me/?text=", ""));
    expect(message).toContain("AB12CD34");
    expect(message).toContain("https://brolly.example/register?ref=AB12CD34");
  });

  it("produces a valid URL with no unencoded whitespace", () => {
    const url = buildWaMeUrl("https://brolly.example", "AB12CD34");
    expect(url).not.toMatch(/\s/);
    expect(() => new URL(url)).not.toThrow();
  });
});

describe("normalizeReferralCode()", () => {
  it("strips and uppercases", () => {
    expect(normalizeReferralCode("  ab12cd34  ")).toBe("AB12CD34");
  });

  it("aliases O/I/L to digits", () => {
    expect(normalizeReferralCode("O1I2L3")).toBe("011213");
  });
});

describe("isValidReferralCodeFormat()", () => {
  it("accepts an 8-char Crockford code", () => {
    expect(isValidReferralCodeFormat("AB12CD34")).toBe(true);
  });

  it("rejects the wrong length", () => {
    expect(isValidReferralCodeFormat("AB12")).toBe(false);
  });

  it("rejects confusable letters (I/L/O/U), which normalize already removes", () => {
    expect(isValidReferralCodeFormat("ABILOU12")).toBe(false);
  });
});
