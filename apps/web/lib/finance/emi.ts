// The atomic EMI calculation. Every loan calculator (home, car, personal,
// prepayment, comparison, LAP) and the reverse/eligibility/affordability tools
// build on this one function.

/** Monthly interest rate as a decimal fraction, e.g. 8.5% p.a. -> 0.00708. */
export function monthlyRate(annualRate: number): number {
  return annualRate / 12 / 100;
}

/**
 * Reducing-balance EMI, rounded to the nearest rupee (how banks quote it).
 *
 *   EMI = P * r * (1+r)^n / ((1+r)^n - 1)
 *
 * At r === 0 the formula divides by zero, so the interest-free case degrades to
 * a straight-line P / n.
 */
export function emi(principal: number, annualRate: number, months: number): number {
  if (months <= 0 || principal <= 0) return 0;
  const r = monthlyRate(annualRate);
  if (r === 0) return Math.round(principal / months);
  const factor = Math.pow(1 + r, months);
  return Math.round((principal * r * factor) / (factor - 1));
}
