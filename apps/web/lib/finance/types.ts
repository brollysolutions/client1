// Shared types for the pure finance engine (lib/finance/*). Every function here
// is a pure numeric calculation with no I/O and no data-table dependency, so it
// can be unit-tested in isolation and reused across all calculators. Rupee
// amounts are integers (banks quote and schedule to the nearest rupee); rates
// and yields are percentages unless noted.

export interface EmiInputs {
  /** Loan principal in rupees. */
  principal: number;
  /** Nominal annual interest rate, e.g. 8.5 for 8.5% p.a. */
  annualRate: number;
  /** Tenure in months. */
  months: number;
}

export interface AmortRow {
  /** 1-based installment number. */
  index: number;
  openingBalance: number;
  emi: number;
  interest: number;
  principal: number;
  closingBalance: number;
}

/** One financial-year (Apr-Mar) bucket aggregated from the monthly rows. */
export interface FyRow {
  fyLabel: string;
  principalPaid: number;
  interestPaid: number;
  closingBalance: number;
}

export interface Schedule {
  /** The regular (steady) monthly EMI; the final row may differ by a few rupees. */
  emi: number;
  /** Sum of every installment actually paid (regular months + adjusted final). */
  totalPayment: number;
  totalInterest: number;
  rows: AmortRow[];
  fyRows: FyRow[];
}
