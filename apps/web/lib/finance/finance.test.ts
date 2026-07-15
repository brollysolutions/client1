import { describe, expect, it } from "vitest";

import {
  affordability,
  amortizationSchedule,
  balanceTransfer,
  cagr,
  cardEmi,
  cardPayoff,
  emi,
  flatToReducing,
  futureValue,
  gstOnProperty,
  healthCover,
  homeLtvRatio,
  loanEligibility,
  prepayment,
  rentalYield,
  rentVsBuy,
  reverseEmi,
  sipForGoal,
  stampDuty,
  termCover,
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

describe("cardPayoff()", () => {
  it("matches the fixed-payment benchmark with GST on interest", () => {
    const r = cardPayoff({ balance: 100_000, annualRate: 42, monthlyPayment: 5_000 });
    expect(r.fixed.months).toBe(44);
    expect(r.fixed.totalInterest).toBe(98_371);
    expect(r.fixed.totalGst).toBe(17_708);
    expect(r.fixed.totalPaid).toBe(216_079);
    expect(r.fixed.neverClears).toBe(false);
  });

  it("matches the closed form when GST is off", () => {
    const r = cardPayoff({ balance: 100_000, annualRate: 42, monthlyPayment: 5_000, gstRate: 0 });
    expect(r.fixed.months).toBe(35);
    expect(r.fixed.totalInterest).toBe(74_990);
    expect(r.fixed.totalPaid).toBe(174_990);
  });

  it("flags a payment that cannot beat the monthly charges", () => {
    const r = cardPayoff({ balance: 100_000, annualRate: 42, monthlyPayment: 4_000 });
    expect(r.fixed.neverClears).toBe(true);
    expect(r.savedVsMinDue).toBe(0);
  });

  it("simulates the minimum-due trap to its full length", () => {
    const r = cardPayoff({ balance: 100_000, annualRate: 42, monthlyPayment: 5_000 });
    expect(r.minDue.months).toBe(341);
    expect(r.minDue.totalPaid).toBe(472_872);
    expect(r.minDue.capped).toBe(false);
    expect(r.savedVsMinDue).toBe(
      r.minDue.totalInterest + r.minDue.totalGst - (r.fixed.totalInterest + r.fixed.totalGst),
    );
  });

  it("stays under the cap at the top of the slider range", () => {
    const r = cardPayoff({ balance: 100_000, annualRate: 48, monthlyPayment: 6_000 });
    expect(r.minDue.months).toBe(682);
    expect(r.minDue.capped).toBe(false);
  });

  it("detects the diverging minimum-due path analytically", () => {
    const r = cardPayoff({ balance: 100_000, annualRate: 58, monthlyPayment: 6_000 });
    expect(r.minDue.neverClears).toBe(true);
  });

  it("clears a small balance quickly once the floor beats the charges", () => {
    const r = cardPayoff({ balance: 500, annualRate: 42, monthlyPayment: 5_000 });
    expect(r.minDue.months).toBe(3);
    expect(r.minDue.neverClears).toBe(false);
    expect(r.minDue.capped).toBe(false);
  });

  it("returns zeroed paths for a zero balance", () => {
    const r = cardPayoff({ balance: 0, annualRate: 42, monthlyPayment: 5_000 });
    expect(r.fixed.months).toBe(0);
    expect(r.minDue.months).toBe(0);
  });
});

describe("cardEmi()", () => {
  it("matches the conversion benchmark with GST on fee and interest", () => {
    const r = cardEmi({ amount: 50_000, annualRate: 16, months: 12, processingFee: 199 });
    expect(r.emi).toBe(4_537);
    expect(r.totalInterest).toBe(4_441);
    expect(r.gstOnInterest).toBe(798);
    expect(r.feeWithGst).toBe(235);
    expect(r.totalCost).toBe(55_474);
    expect(r.extraPaidPct).toBeCloseTo(10.95, 1);
    expect(r.effectiveAnnualRate).toBeCloseTo(19.79, 1);
  });

  it("round-trips the IRR to the quoted rate without fee and GST", () => {
    const r = cardEmi({ amount: 50_000, annualRate: 16, months: 12, processingFee: 0, gstRate: 0 });
    expect(r.effectiveAnnualRate).toBeCloseTo(16, 1);
  });

  it("reconciles GST month by month, not on the total", () => {
    const r = cardEmi({ amount: 50_000, annualRate: 16, months: 12 });
    expect(r.gstOnInterest).toBe(798);
    expect(r.firstMonthOutflow).toBeGreaterThan(r.emi);
  });

  it("returns a zeroed result for degenerate inputs", () => {
    expect(cardEmi({ amount: 0, annualRate: 16, months: 12 }).emi).toBe(0);
    expect(cardEmi({ amount: 50_000, annualRate: 16, months: 0 }).emi).toBe(0);
  });
});

describe("termCover()", () => {
  it("matches the two-method benchmark and rounds up to the slab", () => {
    const r = termCover({
      age: 32,
      annualIncome: 1_200_000,
      monthlyExpenses: 40_000,
      outstandingLoans: 3_000_000,
      existingCover: 5_000_000,
      liquidAssets: 1_000_000,
    });
    expect(r.multiplierUsed).toBe(25);
    expect(r.incomeMethod).toBe(27_000_000);
    expect(r.expenseMethod).toBe(10_440_000);
    expect(r.recommended).toBe(27_500_000);
    expect(r.recommended % 2_500_000).toBe(0);
    expect(r.recommended).toBeGreaterThanOrEqual(Math.max(r.incomeMethod, r.expenseMethod));
  });

  it("switches multiplier bands at the documented edges", () => {
    const base = { annualIncome: 1_000_000, monthlyExpenses: 0 };
    expect(termCover({ age: 35, ...base }).multiplierUsed).toBe(25);
    expect(termCover({ age: 36, ...base }).multiplierUsed).toBe(20);
    expect(termCover({ age: 55, ...base }).multiplierUsed).toBe(15);
    expect(termCover({ age: 56, ...base }).multiplierUsed).toBe(10);
  });

  it("reports adequate cover instead of a negative need", () => {
    const r = termCover({
      age: 40,
      annualIncome: 1_000_000,
      monthlyExpenses: 30_000,
      existingCover: 50_000_000,
    });
    expect(r.recommended).toBe(0);
    expect(r.adequatelyCovered).toBe(true);
  });
});

describe("healthCover()", () => {
  it("sizes a metro floater with an extra adult and a senior", () => {
    const r = healthCover({ cityTier: "metro", adults: 3, hasSeniorMember: true });
    expect(r.baseCover).toBe(1_000_000);
    expect(r.extraAdultLoading).toBe(250_000);
    expect(r.seniorLoading).toBe(625_000);
    expect(r.suggested).toBe(2_000_000);
    expect(r.suggestedUpper).toBe(3_000_000);
    expect(r.seniorSeparatePolicyAdvised).toBe(true);
  });

  it("keeps the tier-3 couple at the base band", () => {
    const r = healthCover({ cityTier: "tier3", adults: 2 });
    expect(r.suggested).toBe(500_000);
    expect(r.suggestedUpper).toBe(750_000);
    expect(r.seniorSeparatePolicyAdvised).toBe(false);
  });

  it("never applies a negative loading for a single adult", () => {
    const r = healthCover({ cityTier: "tier2", adults: 1 });
    expect(r.extraAdultLoading).toBe(0);
    expect(r.suggested).toBe(750_000);
  });
});

describe("balanceTransfer()", () => {
  const inputs = {
    outstanding: 2_500_000,
    remainingMonths: 180,
    currentRate: 9.5,
    newRate: 8.5,
    processingFeePct: 0.5,
    flatFee: 5_900,
  };

  it("matches the refinance benchmark", () => {
    const r = balanceTransfer(inputs);
    expect(r.currentEmi).toBe(26_106);
    expect(r.sameTenure.newEmi).toBe(24_618);
    expect(r.sameTenure.monthlySaving).toBe(1_488);
    expect(r.totalFees).toBe(18_400);
    expect(r.sameTenure.breakEvenMonth).toBe(13);
    expect(r.keepEmi.newMonths).toBe(161);
    expect(r.keepEmi.monthsSaved).toBe(19);
    expect(Math.abs(r.keepEmi.interestSaved - 503_926)).toBeLessThanOrEqual(5);
    expect(r.noBenefit).toBe(false);
  });

  it("keep-EMI saves more than same-tenure, like prepayment", () => {
    const r = balanceTransfer(inputs);
    expect(r.keepEmi.netSaving).toBeGreaterThan(r.sameTenure.netSaving);
  });

  it("flags a transfer to the same or a higher rate", () => {
    const r = balanceTransfer({ ...inputs, newRate: 9.5 });
    expect(r.noBenefit).toBe(true);
    expect(r.sameTenure.monthlySaving).toBe(0);
    expect(r.sameTenure.breakEvenMonth).toBeNull();
  });
});

describe("flatToReducing()", () => {
  it("matches the classic 10% flat benchmark", () => {
    const r = flatToReducing({ principal: 100_000, flatRate: 10, months: 60 });
    expect(r.flatEmi).toBe(2_500);
    expect(r.totalInterestFlat).toBe(50_000);
    expect(r.effectiveReducingRate).toBeCloseTo(17.27, 1);
    expect(r.atSameRateReducing.emi).toBe(2_125);
    expect(r.atSameRateReducing.totalInterest).toBe(27_477);
    expect(r.atSameRateReducing.extraPaidOnFlat).toBe(22_523);
  });

  it("solves shorter tenures without losing the bracket", () => {
    expect(
      flatToReducing({ principal: 100_000, flatRate: 12, months: 36 }).effectiveReducingRate,
    ).toBeCloseTo(21.2, 0);
    expect(
      flatToReducing({ principal: 100_000, flatRate: 10, months: 12 }).effectiveReducingRate,
    ).toBeCloseTo(17.97, 0);
    expect(
      flatToReducing({ principal: 100_000, flatRate: 35, months: 12 }).effectiveReducingRate,
    ).toBeCloseTo(59.39, 1);
  });

  it("degenerates to the flat rate at a single installment", () => {
    expect(
      flatToReducing({ principal: 100_000, flatRate: 10, months: 1 }).effectiveReducingRate,
    ).toBeCloseTo(10, 5);
  });

  it("round-trips the effective rate back to the flat EMI", () => {
    const r = flatToReducing({ principal: 100_000, flatRate: 10, months: 60 });
    expect(Math.abs(emi(100_000, r.effectiveReducingRate, 60) - r.flatEmi)).toBeLessThanOrEqual(1);
  });

  it("short-circuits a zero flat rate", () => {
    const r = flatToReducing({ principal: 100_000, flatRate: 0, months: 12 });
    expect(r.effectiveReducingRate).toBe(0);
    expect(r.flatEmi).toBe(Math.round(100_000 / 12));
  });
});

describe("rentVsBuy()", () => {
  const inputs = {
    monthlyRent: 30_000,
    rentGrowth: 5,
    propertyPrice: 10_000_000,
    downPaymentPct: 20,
    loanRate: 8.5,
    appreciation: 5,
    investmentReturn: 12,
    horizonYears: 10,
  };

  it("computes the loan side off the shared schedule", () => {
    const r = rentVsBuy(inputs);
    expect(r.loanAmount).toBe(8_000_000);
    expect(r.emi).toBe(69_426);
    expect(r.upfrontCash).toBe(2_700_000);
  });

  it("prefers renting in the high-investment-return scenario", () => {
    const r = rentVsBuy(inputs);
    expect(r.cheaper).toBe("rent");
    expect(r.breakEvenYear).toBeNull();
    expect(r.buyAdvantageAtHorizon).toBeLessThan(0);
    expect(r.years).toHaveLength(10);
    expect(r.years.at(-1)!.buyAdvantage).toBe(r.buyAdvantageAtHorizon);
  });

  it("flips to buying when appreciation beats the alternative return", () => {
    const r = rentVsBuy({ ...inputs, appreciation: 10, investmentReturn: 6, rentGrowth: 8 });
    expect(r.cheaper).toBe("buy");
    expect(r.breakEvenYear).not.toBeNull();
  });

  it("drops to maintenance-only outgo after the loan ends", () => {
    const r = rentVsBuy({ ...inputs, horizonYears: 30 });
    const afterLoan = r.years[25];
    const value25 = 10_000_000 * Math.pow(1.05, 25);
    expect(afterLoan.ownerOutgo).toBe(Math.round(value25 * 0.01));
    expect(r.years.every((y) => Number.isFinite(y.buyAdvantage))).toBe(true);
  });

  it("degrades to plain arithmetic at zero rates", () => {
    const r = rentVsBuy({
      ...inputs,
      rentGrowth: 0,
      appreciation: 0,
      investmentReturn: 0,
      loanRate: 0,
    });
    expect(Number.isFinite(r.buyAdvantageAtHorizon)).toBe(true);
    // Flat value minus the loan still outstanding after 120 of 240 months.
    expect(r.years.at(-1)!.homeEquity).toBe(5_999_960);
  });
});
