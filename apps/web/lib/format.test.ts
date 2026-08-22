import { describe, expect, it } from "vitest";

import {
  formatCompactINR,
  formatINR,
  formatLastUpdated,
  formatNumber,
  formatPaise,
  formatPaiseCompact,
  formatPercent,
} from "@/lib/format";

describe("formatLastUpdated()", () => {
  it("uses the explicit freshness label required on products and lenders", () => {
    expect(formatLastUpdated("2026-08-21T00:00:00Z")).toBe("Last updated: 21 Aug 2026");
  });
});

describe("formatINR()", () => {
  it("uses en-IN grouping and the rupee symbol", () => {
    expect(formatINR(100_000)).toBe("₹1,00,000");
    expect(formatINR(8678)).toBe("₹8,678");
  });
});

describe("formatCompactINR()", () => {
  it("switches to lakh and crore for big numbers", () => {
    expect(formatCompactINR(1_234_567)).toBe("₹12.35 L");
    expect(formatCompactINR(12_500_000)).toBe("₹1.25 Cr");
    expect(formatCompactINR(50_000)).toBe("₹50,000");
  });
});

describe("formatNumber() / formatPercent()", () => {
  it("formats plain numbers and percentages", () => {
    expect(formatNumber(240)).toBe("240");
    expect(formatPercent(8.5)).toBe("8.50%");
  });
});

describe("formatPaise()", () => {
  it("renders exact rupees without rounding to L/Cr", () => {
    expect(formatPaise(0)).toBe("₹0");
    expect(formatPaise(1)).toBe("₹0.01");
    expect(formatPaise(12345)).toBe("₹123.45");
    expect(formatPaise(100_000)).toBe("₹1,000");
    expect(formatPaise(100_000_000)).toBe("₹10,00,000");
  });
  it("renders a clawback (negative amount_paise) with a leading minus", () => {
    expect(formatPaise(-50_000)).toBe("-₹500");
  });
});

describe("formatPaiseCompact()", () => {
  it("formats lakhs, dropping decimals when whole", () => {
    expect(formatPaiseCompact(500_000_000)).toBe("₹50 L");
  });
  it("formats crores with two decimals when fractional", () => {
    expect(formatPaiseCompact(1_250_000_000)).toBe("₹1.25 Cr");
  });
});
