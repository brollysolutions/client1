import { monthlyRate } from "./emi";

/**
 * Monthly SIP needed to reach a savings goal (e.g. a down payment), assuming
 * contributions at the start of each month:
 *
 *   SIP = FV * r / (((1+r)^n - 1) * (1+r))
 *
 * At r === 0 this is simply FV / n.
 */
export function sipForGoal(goalValue: number, annualRatePct: number, months: number): number {
  if (months <= 0 || goalValue <= 0) return 0;
  const r = monthlyRate(annualRatePct);
  if (r === 0) return Math.round(goalValue / months);
  return Math.round((goalValue * r) / ((Math.pow(1 + r, months) - 1) * (1 + r)));
}
