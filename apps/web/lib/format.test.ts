import { describe, expect, it } from "vitest";

import { formatCompactINR, formatINR, formatNumber, formatPaiseCompact, formatPercent } from "@/lib/format";

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

describe("formatPaiseCompact()", () => {
  it("formats lakhs, dropping decimals when whole", () => {
    expect(formatPaiseCompact(500_000_000)).toBe("₹50 L");
  });
  it("formats crores with two decimals when fractional", () => {
    expect(formatPaiseCompact(1_250_000_000)).toBe("₹1.25 Cr");
  });
});
