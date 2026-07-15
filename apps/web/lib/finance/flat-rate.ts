import { amortizationSchedule } from "./schedule";

export interface FlatToReducingInputs {
  principal: number;
  /** Quoted flat rate in percent per year. */
  flatRate: number;
  months: number;
}

export interface FlatToReducingResult {
  flatEmi: number;
  totalInterestFlat: number;
  /** The reducing-balance rate that produces the same EMI. Unrounded; format at the UI. */
  effectiveReducingRate: number;
  /** What a reducing-balance loan at the same nominal rate would cost instead. */
  atSameRateReducing: {
    emi: number;
    totalInterest: number;
    /** Extra interest the flat quote costs over honest reducing at the same number. */
    extraPaidOnFlat: number;
  };
}

// Continuous (unrounded) annuity EMI. The solver must bisect this, not the
// engine's rupee-rounded emi(): rounding turns EMI into a step function of the
// rate and bisection stalls inside a plateau.
function continuousEmi(principal: number, annualRate: number, months: number): number {
  const r = annualRate / 12 / 100;
  if (r === 0) return principal / months;
  const growth = Math.pow(1 + r, months);
  return (principal * r * growth) / (growth - 1);
}

/**
 * Converts a flat-rate quote (interest on the full principal for the whole
 * tenure, common on car and personal loans) to the effective reducing-balance
 * rate it actually costs. Solved by bisection on the continuous EMI formula:
 * f(rate) is monotone increasing, bracketed on [0, 200] (a 100% flat quote at
 * short tenures exceeds 100% reducing, so 60 or even 100 is not enough), and
 * 100 halvings pin the rate far below display precision.
 */
export function flatToReducing({
  principal,
  flatRate,
  months,
}: FlatToReducingInputs): FlatToReducingResult {
  if (principal <= 0 || months <= 0) {
    return {
      flatEmi: 0,
      totalInterestFlat: 0,
      effectiveReducingRate: 0,
      atSameRateReducing: { emi: 0, totalInterest: 0, extraPaidOnFlat: 0 },
    };
  }

  const totalInterestExact = (principal * (flatRate / 100) * months) / 12;
  const flatEmiExact = (principal + totalInterestExact) / months;

  let effective = 0;
  if (flatRate > 0) {
    let lo = 0;
    let hi = 200;
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      if (continuousEmi(principal, mid, months) < flatEmiExact) lo = mid;
      else hi = mid;
    }
    effective = (lo + hi) / 2;
  }

  // Reducing-balance loan at the same nominal rate, via the schedule so the
  // figures agree to the rupee with the EMI calculator.
  const reducing = amortizationSchedule({ principal, annualRate: flatRate, months });
  const totalInterestFlat = Math.round(totalInterestExact);

  return {
    flatEmi: Math.round(flatEmiExact),
    totalInterestFlat,
    effectiveReducingRate: effective,
    atSameRateReducing: {
      emi: reducing.emi,
      totalInterest: reducing.totalInterest,
      extraPaidOnFlat: totalInterestFlat - reducing.totalInterest,
    },
  };
}
