import { monthlyRate } from "./emi";

export interface CardPayoffInputs {
  /** Outstanding card balance. */
  balance: number;
  /** Card APR in percent, e.g. 42 for 3.5% a month. */
  annualRate: number;
  /** Fixed amount paid every month on the fixed-payment path. */
  monthlyPayment: number;
  /** GST charged on card interest. Card interest is not GST-exempt in India. */
  gstRate?: number;
  /** Minimum due as a percent of the statement balance. */
  minDuePct?: number;
  /** Rupee floor on the minimum due. */
  minDueFloor?: number;
}

export interface PayoffPath {
  months: number;
  totalInterest: number;
  totalGst: number;
  totalPaid: number;
  /**
   * True when the payment can never amortize the balance: the fixed payment
   * does not cover the first month's interest plus GST, or the minimum due
   * shrinks slower than interest accrues. The island should warn, not chart.
   */
  neverClears: boolean;
  /** True when the simulation hit the 1200-month safety cap. */
  capped: boolean;
}

export interface CardPayoffResult {
  fixed: PayoffPath;
  minDue: PayoffPath;
  /** Interest plus GST avoided by paying fixed instead of minimum due. 0 when either path never clears. */
  savedVsMinDue: number;
}

const CAP = 1200;

const EMPTY_PATH: PayoffPath = {
  months: 0,
  totalInterest: 0,
  totalGst: 0,
  totalPaid: 0,
  neverClears: false,
  capped: false,
};

function neverPath(): PayoffPath {
  return { ...EMPTY_PATH, neverClears: true };
}

// One month of card charges under the statement convention: interest posts on
// the opening balance, GST posts on the interest, both round to the rupee.
function charges(balance: number, r: number, gstRate: number): { interest: number; gst: number } {
  const interest = r === 0 ? 0 : Math.round(balance * r);
  const gst = Math.round((interest * gstRate) / 100);
  return { interest, gst };
}

function simulate(
  balance: number,
  r: number,
  gstRate: number,
  paymentFor: (statement: number) => number,
): PayoffPath {
  let bal = balance;
  let months = 0;
  let totalInterest = 0;
  let totalGst = 0;
  let totalPaid = 0;
  while (bal > 0.5 && months < CAP) {
    const { interest, gst } = charges(bal, r, gstRate);
    const statement = bal + interest + gst;
    const pay = Math.min(paymentFor(statement), statement);
    totalInterest += interest;
    totalGst += gst;
    totalPaid += pay;
    bal = statement - pay;
    months += 1;
  }
  return { months, totalInterest, totalGst, totalPaid, neverClears: false, capped: bal > 0.5 };
}

/**
 * Credit card payoff, two ways at once: a fixed monthly payment versus paying
 * only the minimum due. Card interest compounds monthly and, unlike loan
 * interest, carries 18% GST, so both paths post interest plus GST to the
 * statement before the payment lands. The minimum due is computed on that
 * post-interest statement balance, `max(minDuePct% of statement, floor)`,
 * the standard calculator convention (issuers vary the exact formula after
 * the RBI 2022 Master Direction).
 */
export function cardPayoff({
  balance,
  annualRate,
  monthlyPayment,
  gstRate = 18,
  minDuePct = 5,
  minDueFloor = 200,
}: CardPayoffInputs): CardPayoffResult {
  const r = monthlyRate(annualRate);

  if (balance <= 0) {
    return { fixed: { ...EMPTY_PATH }, minDue: { ...EMPTY_PATH }, savedVsMinDue: 0 };
  }

  const first = charges(balance, r, gstRate);
  const firstCharges = first.interest + first.gst;

  // Fixed path: a payment that does not beat the first month's charges never
  // touches principal, so the balance only grows.
  const fixed =
    monthlyPayment <= firstCharges && firstCharges > 0
      ? neverPath()
      : simulate(balance, r, gstRate, () => monthlyPayment);

  // Min-due path: when the percent-based due governs, the balance changes by a
  // constant factor (1 + monthly charge rate) * (1 - minDuePct/100) each month.
  // A factor >= 1 means the balance grows forever; detect it analytically
  // instead of burning the simulation cap. The rupee floor only rescues small
  // balances, which show up as a first-month due larger than the charges.
  const chargeRate = r * (1 + gstRate / 100);
  const factor = (1 + chargeRate) * (1 - minDuePct / 100);
  const firstStatement = balance + firstCharges;
  const firstDue = Math.max(Math.round((firstStatement * minDuePct) / 100), minDueFloor);
  const minDue =
    factor >= 1 && firstDue <= firstCharges
      ? neverPath()
      : simulate(balance, r, gstRate, (statement) =>
          Math.max(Math.round((statement * minDuePct) / 100), minDueFloor),
        );

  const bothClear = !fixed.neverClears && !fixed.capped && !minDue.neverClears && !minDue.capped;
  const savedVsMinDue = bothClear
    ? Math.max(0, minDue.totalInterest + minDue.totalGst - (fixed.totalInterest + fixed.totalGst))
    : 0;

  return { fixed, minDue, savedVsMinDue };
}
