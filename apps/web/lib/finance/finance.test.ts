import { describe, expect, it } from "vitest";

import {
  affordability,
  amortizationSchedule,
  cagr,
  emi,
  futureValue,
  gstOnProperty,
  homeLtvRatio,
  loanEligibility,
  prepayment,
  rentalYield,
  reverseEmi,
  sipForGoal,
  stampDuty,
} from "@/lib/finance";

const FIXED_START = new Date(2026, 3, 1); // Apr 2026, for deterministic FY buckets

describe("emi()", () => {
  it("matches the standard reducing-balance benchmark", () => {
    // 10,00,000 @ 8.5% over 240 months ~ 8,678
    expect(emi(1_000_000, 8.5, 240)).toBe(8678);
  });

  it("degrades to straight-line at 0% interest", () => {
    expect(emi(120_000, 0, 12)).toBe(10_000);
  });

  it("returns 0 for degenerate inputs", () => {
    expect(emi(0, 8.5, 240)).toBe(0);
    expect(emi(1_000_000, 8.5, 0)).toBe(0);
  });
});

describe("amortizationSchedule()", () => {
  const schedule = amortizationSchedule(
    { principal: 1_000_000, annualRate: 8.5, months: 240 },
    { startDate: FIXED_START },
  );

  it("zeroes the balance exactly on the final installment", () => {
    expect(schedule.rows).toHaveLength(240);
    expect(schedule.rows.at(-1)!.closingBalance).toBe(0);
  });

  it("has principal that sums to the loan and interest that reconciles to the total", () => {
    const paidPrincipal = schedule.rows.reduce((s, r) => s + r.principal, 0);
    const paidInterest = schedule.rows.reduce((s, r) => s + r.interest, 0);
    expect(paidPrincipal).toBe(1_000_000);
    expect(paidInterest).toBe(schedule.totalInterest);
    expect(schedule.totalPayment).toBe(1_000_000 + schedule.totalInterest);
  });

  it("reconciles the financial-year buckets against the monthly rows", () => {
    const fyPrincipal = schedule.fyRows.reduce((s, r) => s + r.principalPaid, 0);
    expect(fyPrincipal).toBe(1_000_000);
    // First FY bucket starts Apr 2026.
    expect(schedule.fyRows[0].fyLabel).toBe("FY 2026-27");
  });

  it("handles the 0% interest schedule", () => {
    const zero = amortizationSchedule(
      { principal: 120_000, annualRate: 0, months: 12 },
      { startDate: FIXED_START },
    );
    expect(zero.totalInterest).toBe(0);
    expect(zero.rows.at(-1)!.closingBalance).toBe(0);
    expect(zero.rows.reduce((s, r) => s + r.principal, 0)).toBe(120_000);
  });
});

describe("reverseEmi()", () => {
  it("round-trips against emi() within a rupee", () => {
    const monthly = emi(2_500_000, 9, 180);
    expect(Math.abs(reverseEmi(monthly, 9, 180) - 2_500_000)).toBeLessThanOrEqual(50);
  });

  it("collapses to EMI * n at 0%", () => {
    expect(reverseEmi(10_000, 0, 12)).toBe(120_000);
  });
});

describe("loanEligibility()", () => {
  it("sanctions the lower of the FOIR and multiplier caps", () => {
    const r = loanEligibility({ netMonthlyIncome: 100_000, annualRate: 8.5, months: 240 });
    expect(r.sanctioned).toBe(Math.min(r.maxLoanFoir, r.maxLoanMultiplier));
  });

  it("reduces the affordable EMI by existing obligations", () => {
    const base = loanEligibility({ netMonthlyIncome: 100_000, annualRate: 8.5, months: 240 });
    const withEmi = loanEligibility({
      netMonthlyIncome: 100_000,
      annualRate: 8.5,
      months: 240,
      existingEmis: 20_000,
    });
    expect(withEmi.maxEmi).toBe(base.maxEmi - 20_000);
    expect(withEmi.maxLoanFoir).toBeLessThan(base.maxLoanFoir);
  });
});

describe("prepayment()", () => {
  const result = prepayment({
    principal: 3_000_000,
    annualRate: 9,
    months: 240,
    prepayAtMonth: 24,
    lumpSum: 500_000,
  });

  it("saves both tenure and interest, and never trips the guard for a normal loan", () => {
    expect(result.guardTriggered).toBe(false);
    expect(result.reduceTenure.monthsSaved).toBeGreaterThan(0);
    expect(result.reduceTenure.interestSaved).toBeGreaterThan(0);
    expect(result.reduceEmi.newEmi).toBeLessThan(result.regularEmi);
  });

  it("saves more interest by reducing tenure than by reducing EMI", () => {
    expect(result.reduceTenure.interestSaved).toBeGreaterThan(result.reduceEmi.interestSaved);
  });

  it("never returns NaN or Infinity", () => {
    for (const v of [result.reduceTenure.newMonths, result.reduceTenure.interestSaved, result.reduceEmi.newEmi, result.reduceEmi.interestSaved]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe("real-estate helpers", () => {
  it("applies the RBI LTV bands", () => {
    expect(homeLtvRatio(2_500_000)).toBe(0.9);
    expect(homeLtvRatio(5_000_000)).toBe(0.8);
    expect(homeLtvRatio(9_000_000)).toBe(0.75);
  });

  it("computes an affordable property price bounded by income and LTV", () => {
    const r = affordability({
      netMonthlyIncome: 100_000,
      annualRate: 8.5,
      months: 240,
      downPayment: 1_000_000,
    });
    expect(r.maxProperty).toBe(r.maxLoan + 1_000_000);
    expect(r.maxLoan).toBeGreaterThan(0);
  });

  it("charges stamp duty and registration on the property value", () => {
    const r = stampDuty(5_000_000, 6, 1);
    expect(r.stampDuty).toBe(300_000);
    expect(r.registration).toBe(50_000);
    expect(r.total).toBe(350_000);
  });

  it("taxes only under-construction property, at the effective rate on full value", () => {
    expect(gstOnProperty(5_000_000, "ready").gst).toBe(0);
    // 1% and 5% are effective rates on the full sale value (the one-third land
    // abatement is already baked in), so no separate 2/3 deduction is applied.
    expect(gstOnProperty(4_000_000, "affordable")).toEqual({
      rate: 0.01,
      gst: 40_000,
    });
    expect(gstOnProperty(6_000_000, "non-affordable")).toEqual({
      rate: 0.05,
      gst: 300_000,
    });
  });

  it("compounds property appreciation and derives CAGR", () => {
    expect(futureValue(5_000_000, 7, 10)).toBe(Math.round(5_000_000 * Math.pow(1.07, 10)));
    expect(cagr(5_000_000, 10_000_000, 10)).toBeCloseTo(7.177, 2);
  });

  it("computes gross and net rental yield", () => {
    const r = rentalYield({ propertyValue: 10_000_000, monthlyRent: 30_000, annualExpenses: 60_000 });
    expect(r.annualRent).toBe(360_000);
    expect(r.grossYield).toBeCloseTo(3.6, 5);
    expect(r.netYield).toBeCloseTo(3.0, 5);
  });

  it("sizes the SIP needed to reach a goal", () => {
    expect(sipForGoal(1_200_000, 0, 12)).toBe(100_000);
    expect(sipForGoal(1_000_000, 12, 60)).toBeGreaterThan(0);
  });
});
