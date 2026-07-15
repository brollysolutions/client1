import { cardPayoff } from "./card-payoff";
import { amortizationSchedule } from "./schedule";

export interface CardEmiInputs {
  /** Purchase or outstanding amount being converted. */
  amount: number;
  /** Conversion interest rate in percent, typically 14 to 18. */
  annualRate: number;
  months: number;
  /** One-time processing fee in rupees (banks quote flat or 1-3%; enter the rupee figure). */
  processingFee?: number;
  /** GST rate applied on the processing fee AND on the interest part of every EMI. */
  gstRate?: number;
  /** Card APR used for the keep-revolving comparison. */
  revolveApr?: number;
}

export interface CardEmiResult {
  emi: number;
  totalInterest: number;
  /** Sum of the per-month GST on interest, the way card statements bill it. */
  gstOnInterest: number;
  feeWithGst: number;
  totalCost: number;
  /** Total cost above the converted amount, as a percent of it. */
  extraPaidPct: number;
  /** Nominal annual rate implied by the real cash flows including fee and GST. The honest headline. */
  effectiveAnnualRate: number;
  /** Real month-1 outgo: EMI plus GST on that month's interest (fee billed separately). */
  firstMonthOutflow: number;
  /** What the same monthly amount would cost if you kept revolving at the card APR instead. */
  vsRevolving: {
    months: number;
    totalInterest: number;
    totalGst: number;
    extraCostVsEmi: number;
    neverClears: boolean;
  };
}

const ZERO_RESULT: CardEmiResult = {
  emi: 0,
  totalInterest: 0,
  gstOnInterest: 0,
  feeWithGst: 0,
  totalCost: 0,
  extraPaidPct: 0,
  effectiveAnnualRate: 0,
  firstMonthOutflow: 0,
  vsRevolving: { months: 0, totalInterest: 0, totalGst: 0, extraCostVsEmi: 0, neverClears: false },
};

// Monthly IRR of the conversion's actual cash flows: you receive the amount
// net of the fee up front and pay EMI plus GST-on-interest each month. NPV is
// monotone decreasing in the rate, so plain bisection on [0, 1] converges.
function monthlyIrr(netAmount: number, outflows: number[]): number {
  if (netAmount <= 0 || outflows.length === 0) return 0;
  const npv = (rate: number): number => {
    let value = -netAmount;
    let discount = 1;
    for (const flow of outflows) {
      discount /= 1 + rate;
      value += flow * discount;
    }
    return value;
  };
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (npv(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Cost of converting a card purchase or balance to EMI, the way the statement
 * actually bills it: 18% GST on the processing fee and on the interest part of
 * every installment. Also answers "was this cheaper than revolving?" by paying
 * the same EMI against the balance at the card APR. No-cost EMI (merchant
 * subvention) is a different product and is out of scope here.
 */
export function cardEmi({
  amount,
  annualRate,
  months,
  processingFee = 0,
  gstRate = 18,
  revolveApr = 42,
}: CardEmiInputs): CardEmiResult {
  if (amount <= 0 || months <= 0) return { ...ZERO_RESULT };

  const schedule = amortizationSchedule({ principal: amount, annualRate, months });
  const gstPerMonth = schedule.rows.map((row) => Math.round((row.interest * gstRate) / 100));
  const gstOnInterest = gstPerMonth.reduce((sum, gst) => sum + gst, 0);
  const feeWithGst = processingFee + Math.round((processingFee * gstRate) / 100);
  const totalCost = amount + schedule.totalInterest + gstOnInterest + feeWithGst;

  const outflows = schedule.rows.map((row, i) => row.emi + gstPerMonth[i]);
  const irr = monthlyIrr(amount - feeWithGst, outflows);

  const revolve = cardPayoff({
    balance: amount,
    annualRate: revolveApr,
    monthlyPayment: schedule.emi,
    gstRate,
  }).fixed;

  return {
    emi: schedule.emi,
    totalInterest: schedule.totalInterest,
    gstOnInterest,
    feeWithGst,
    totalCost,
    extraPaidPct: ((totalCost - amount) / amount) * 100,
    effectiveAnnualRate: irr * 12 * 100,
    firstMonthOutflow: schedule.rows[0].emi + gstPerMonth[0],
    vsRevolving: {
      months: revolve.months,
      totalInterest: revolve.totalInterest,
      totalGst: revolve.totalGst,
      extraCostVsEmi:
        revolve.neverClears || revolve.capped
          ? 0
          : revolve.totalInterest + revolve.totalGst - (schedule.totalInterest + gstOnInterest + feeWithGst),
      neverClears: revolve.neverClears,
    },
  };
}
