import { monthlyRate } from "./emi";

/**
 * Inverse of {@link emi}: the largest principal whose EMI fits within
 * `affordableEmi` at the given rate and tenure. Used by the eligibility and
 * affordability calculators.
 *
 *   P = EMI * ((1+r)^n - 1) / (r * (1+r)^n)
 *
 * At r === 0 this collapses to EMI * n.
 */
export function reverseEmi(
  affordableEmi: number,
  annualRate: number,
  months: number,
): number {
  if (months <= 0 || affordableEmi <= 0) return 0;
  const r = monthlyRate(annualRate);
  if (r === 0) return Math.round(affordableEmi * months);
  const factor = Math.pow(1 + r, months);
  return Math.round((affordableEmi * (factor - 1)) / (r * factor));
}
