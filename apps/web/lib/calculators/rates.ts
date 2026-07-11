// Indicative default interest rates and sensible input bounds per loan type.
// These seed the calculators so a first-time visitor sees a realistic result
// without typing anything. They are examples, NOT offers, hence RATE_DISCLAIMER.
// No real lender names appear until banks are actually onboarded; swap these
// numbers then.

export interface LoanDefaults {
  /** Prefilled loan amount. */
  amount: number;
  amountMin: number;
  amountMax: number;
  amountStep: number;
  /** Prefilled annual interest rate (percent). */
  rate: number;
  rateMin: number;
  rateMax: number;
  rateStep: number;
  /** Prefilled tenure in months. */
  months: number;
  monthsMin: number;
  monthsMax: number;
}

export const LOAN_DEFAULTS: Record<"home" | "car" | "personal", LoanDefaults> = {
  home: {
    amount: 3_000_000,
    amountMin: 100_000,
    amountMax: 200_000_000,
    amountStep: 50_000,
    rate: 8.5,
    rateMin: 5,
    rateMax: 18,
    rateStep: 0.05,
    months: 240,
    monthsMin: 12,
    monthsMax: 360,
  },
  car: {
    amount: 800_000,
    amountMin: 50_000,
    amountMax: 20_000_000,
    amountStep: 25_000,
    rate: 9.5,
    rateMin: 6,
    rateMax: 20,
    rateStep: 0.05,
    months: 60,
    monthsMin: 12,
    monthsMax: 96,
  },
  personal: {
    amount: 500_000,
    amountMin: 25_000,
    amountMax: 5_000_000,
    amountStep: 10_000,
    rate: 13,
    rateMin: 9,
    rateMax: 30,
    rateStep: 0.05,
    months: 36,
    monthsMin: 6,
    monthsMax: 84,
  },
};

/** Shown next to every prefilled rate. Config-driven so it updates in one place. */
export const RATE_DISCLAIMER =
  "Rates shown are indicative examples for illustration only and are not an offer. Your actual rate, fees, and eligibility depend on the lender's assessment of your profile and are subject to change.";

/**
 * Last time every drift-prone constant in this file, stamp-duty-rates.ts, and
 * lib/finance/{gst,ltv,eligibility,affordability}.ts was checked against its
 * source (RBI, state stamp duty portals, GST council). Shown in the
 * Indicative callout so staleness is visible, not silent. Review cadence and
 * per-value sources: docs/runbooks/calculator-rates-review.md.
 */
export const RATES_LAST_REVIEWED = "July 2026";
