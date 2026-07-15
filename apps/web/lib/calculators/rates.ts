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

// One entry per EMI-shaped loan product the site advertises (see
// lib/products.ts). Keys match the product ids so labels never drift. Credit
// cards and insurance are intentionally absent — revolving credit and premiums
// don't amortize on a fixed EMI. amountMax is the slider's ceiling, not a hard
// cap: the amount field lets a typed number exceed it (allowAboveMax) so any
// EMI is computable.
export type LoanType =
  | "personal"
  | "business"
  | "property"
  | "vehicle"
  | "education";

export const LOAN_DEFAULTS: Record<LoanType, LoanDefaults> = {
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
  business: {
    amount: 1_500_000,
    amountMin: 50_000,
    amountMax: 100_000_000,
    amountStep: 50_000,
    rate: 15,
    rateMin: 11,
    rateMax: 26,
    rateStep: 0.05,
    months: 60,
    monthsMin: 12,
    monthsMax: 120,
  },
  property: {
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
  vehicle: {
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
  education: {
    amount: 800_000,
    amountMin: 50_000,
    amountMax: 15_000_000,
    amountStep: 25_000,
    rate: 11,
    rateMin: 8,
    rateMax: 16,
    rateStep: 0.05,
    months: 84,
    monthsMin: 12,
    monthsMax: 180,
  },
};

// Slider bounds and prefills for the credit card calculators. The APR ceiling
// stays at 48 deliberately: above roughly 53.5% APR (with GST) the minimum-due
// path stops amortizing at all, and the payoff simulation is capped at 1200
// months, so 48 keeps every slider position convergent and honest.
export const CARD_PAYOFF_DEFAULTS = {
  balance: 100_000,
  balanceMin: 10_000,
  balanceMax: 1_000_000,
  balanceStep: 5_000,
  apr: 42,
  aprMin: 18,
  aprMax: 48,
  aprStep: 0.1,
  payment: 5_000,
  paymentMin: 500,
  paymentMax: 100_000,
  paymentStep: 500,
} as const;

export const CARD_EMI_DEFAULTS = {
  amount: 50_000,
  amountMin: 5_000,
  amountMax: 500_000,
  amountStep: 1_000,
  rate: 16,
  rateMin: 9,
  rateMax: 24,
  rateStep: 0.05,
  months: 12,
  monthsMin: 3,
  monthsMax: 48,
  fee: 199,
  feeMin: 0,
  feeMax: 2_000,
  feeStep: 50,
} as const;

// Slider bounds for the insurance cover calculators. The multiplier bands and
// the tier table themselves live with the engine (lib/finance/term-cover.ts,
// health-cover.ts) as reviewed constants.
export const TERM_COVER_DEFAULTS = {
  age: 32,
  ageMin: 18,
  ageMax: 65,
  income: 1_200_000,
  incomeMin: 200_000,
  incomeMax: 20_000_000,
  incomeStep: 50_000,
  expenses: 40_000,
  expensesMin: 10_000,
  expensesMax: 500_000,
  expensesStep: 5_000,
  loans: 0,
  loansMin: 0,
  loansMax: 50_000_000,
  loansStep: 100_000,
  cover: 0,
  coverMin: 0,
  coverMax: 100_000_000,
  coverStep: 500_000,
  assets: 0,
  assetsMin: 0,
  assetsMax: 50_000_000,
  assetsStep: 100_000,
} as const;

export const HEALTH_COVER_DEFAULTS = {
  adults: 2,
  adultsMin: 1,
  adultsMax: 6,
} as const;

export const BALANCE_TRANSFER_DEFAULTS = {
  outstanding: 2_500_000,
  outstandingMin: 100_000,
  outstandingMax: 100_000_000,
  outstandingStep: 50_000,
  months: 180,
  monthsMin: 12,
  monthsMax: 360,
  currentRate: 9.5,
  newRate: 8.5,
  rateMin: 5,
  rateMax: 18,
  rateStep: 0.05,
  feePct: 0.5,
  feePctMin: 0,
  feePctMax: 3,
  feePctStep: 0.05,
  flatFee: 5_900,
  flatFeeMin: 0,
  flatFeeMax: 50_000,
  flatFeeStep: 100,
} as const;

export const FLAT_RATE_DEFAULTS = {
  principal: 500_000,
  principalMin: 25_000,
  principalMax: 5_000_000,
  principalStep: 10_000,
  flatRate: 10,
  flatRateMin: 1,
  flatRateMax: 30,
  flatRateStep: 0.1,
  months: 60,
  monthsMin: 6,
  monthsMax: 84,
} as const;

export const RENT_VS_BUY_DEFAULTS = {
  rent: 30_000,
  rentMin: 5_000,
  rentMax: 300_000,
  rentStep: 1_000,
  rentGrowth: 5,
  rentGrowthMin: 0,
  rentGrowthMax: 15,
  price: 10_000_000,
  priceMin: 1_000_000,
  priceMax: 100_000_000,
  priceStep: 100_000,
  downPct: 20,
  downPctMin: 10,
  downPctMax: 90,
  loanRate: 8.5,
  loanRateMin: 5,
  loanRateMax: 18,
  loanRateStep: 0.05,
  appreciation: 5,
  appreciationMin: 0,
  appreciationMax: 15,
  investReturn: 12,
  investReturnMin: 0,
  investReturnMax: 18,
  horizon: 10,
  horizonMin: 1,
  horizonMax: 30,
} as const;

/** Shown next to every prefilled rate. Config-driven so it updates in one place. */
export const RATE_DISCLAIMER =
  "Rates shown are indicative examples for illustration only and are not an offer. Your actual rate, fees, and eligibility depend on the lender's assessment of your profile and are subject to change.";

/** The lender-rate disclaimer reads wrong on insurance, which sizes cover, not price. */
export const INSURANCE_DISCLAIMER =
  "This is a cover-sizing guide, not a premium quote or advice. Premiums depend on the insurer's assessment of your age, health, and history. Talk to a licensed advisor before you buy.";

/**
 * Last time every drift-prone constant in this file, stamp-duty-rates.ts, and
 * lib/finance/{gst,ltv,eligibility,affordability,card-payoff,card-emi,
 * term-cover,health-cover,rent-vs-buy}.ts was checked against its source
 * (RBI, state stamp duty portals, GST council, card issuer terms, insurer
 * sizing norms). Shown in the Indicative callout so staleness is visible, not
 * silent. Review cadence and per-value sources:
 * docs/runbooks/calculator-rates-review.md.
 */
export const RATES_LAST_REVIEWED = "July 2026";
