import { reverseEmi } from "./reverse";

export interface EligibilityInputs {
  /** Net (take-home) monthly income in rupees. */
  netMonthlyIncome: number;
  annualRate: number;
  months: number;
  /** Fixed-obligations-to-income ratio cap, 0-1. Banks use ~0.4-0.55. */
  foir?: number;
  /** Existing monthly EMIs already committed. */
  existingEmis?: number;
  /** Income multiplier cap (banks sanction up to ~48-60x net monthly income). */
  multiplier?: number;
}

export interface EligibilityResult {
  maxEmi: number;
  maxLoanFoir: number;
  maxLoanMultiplier: number;
  /** Banks sanction the lower of the FOIR-based and multiplier-based caps. */
  sanctioned: number;
}

// How much a lender will lend, the Indian way: the smaller of what the FOIR cap
// allows (via the affordable EMI) and a flat multiple of monthly income.
export function loanEligibility({
  netMonthlyIncome,
  annualRate,
  months,
  foir = 0.5,
  existingEmis = 0,
  multiplier = 60,
}: EligibilityInputs): EligibilityResult {
  const maxEmi = Math.max(0, Math.round(netMonthlyIncome * foir - existingEmis));
  const maxLoanFoir = reverseEmi(maxEmi, annualRate, months);
  const maxLoanMultiplier = Math.round(multiplier * netMonthlyIncome);
  return {
    maxEmi,
    maxLoanFoir,
    maxLoanMultiplier,
    sanctioned: Math.min(maxLoanFoir, maxLoanMultiplier),
  };
}
