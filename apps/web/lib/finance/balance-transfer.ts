import { emi as calcEmi, monthlyRate } from "./emi";

export interface BalanceTransferInputs {
  /** Outstanding principal on the running loan. */
  outstanding: number;
  /** Months left on the running loan. */
  remainingMonths: number;
  currentRate: number;
  newRate: number;
  /** New lender's processing fee as a percent of the outstanding. */
  processingFeePct?: number;
  /** Fixed switch costs: MOD, stamp, legal, valuation. */
  flatFee?: number;
}

export interface BalanceTransferResult {
  currentEmi: number;
  totalFees: number;
  /** Transfer at the new rate, keep the same remaining tenure: lower EMI. */
  sameTenure: {
    newEmi: number;
    monthlySaving: number;
    /** Interest saved over the tenure, by simulation (agrees to the rupee with the EMI calculator). */
    grossSaving: number;
    netSaving: number;
    /** Month the fees are recovered by the EMI saving. Null when there is no monthly saving. */
    breakEvenMonth: number | null;
  };
  /** Transfer and keep paying the old EMI: the loan closes early. */
  keepEmi: {
    newMonths: number;
    monthsSaved: number;
    interestSaved: number;
    netSaving: number;
  };
  /** True when the switch cannot save money (rate not lower, or fees eat the saving). */
  noBenefit: boolean;
}

// Interest paid over a run of installments, by simulation, robust to rounding
// and early payoff. Same shape as the helper in prepayment.ts.
function interestOver(balance: number, r: number, emiAmount: number, months: number): number {
  let bal = balance;
  let interestSum = 0;
  const cap = Math.min(months, 1200);
  for (let i = 0; i < cap && bal > 0.5; i++) {
    const interest = r === 0 ? 0 : bal * r;
    let principal = emiAmount - interest;
    if (principal >= bal) principal = bal;
    interestSum += interest;
    bal -= principal;
  }
  return interestSum;
}

/**
 * Savings from refinancing a running loan at a lower rate. Only three inputs
 * describe the old loan because of the annuity identity: the balance after any
 * number of payments re-amortizes to the original EMI over the remaining term,
 * so emi(outstanding, currentRate, remainingMonths) IS the borrower's EMI.
 *
 * Two ways to take the benefit, mirroring prepayment: keep the tenure and
 * pocket the EMI difference (cash-flow relief), or keep paying the old EMI at
 * the new rate and close early (bigger total saving). They answer different
 * questions, which the island copy must say.
 */
export function balanceTransfer({
  outstanding,
  remainingMonths,
  currentRate,
  newRate,
  processingFeePct = 0.5,
  flatFee = 0,
}: BalanceTransferInputs): BalanceTransferResult {
  const r1 = monthlyRate(currentRate);
  const r2 = monthlyRate(newRate);
  const currentEmi = calcEmi(outstanding, currentRate, remainingMonths);
  const totalFees = Math.round((outstanding * processingFeePct) / 100) + flatFee;

  const oldInterest = interestOver(outstanding, r1, currentEmi, remainingMonths);

  // Same tenure, lower EMI.
  const newEmi = calcEmi(outstanding, newRate, remainingMonths);
  const monthlySaving = currentEmi - newEmi;
  const grossSaving = Math.round(
    oldInterest - interestOver(outstanding, r2, newEmi, remainingMonths),
  );
  const sameTenureNet = grossSaving - totalFees;
  const breakEvenMonth = monthlySaving > 0 ? Math.ceil(totalFees / monthlySaving) : null;

  // Keep the old EMI at the new rate, close early. The denominator guard is
  // unreachable when newRate < currentRate (the EMI amortizes at the higher
  // rate, so certainly at the lower) but protects the newRate >= currentRate path.
  let newMonths = remainingMonths;
  if (outstanding > 0) {
    if (r2 === 0) {
      newMonths = Math.ceil(outstanding / currentEmi);
    } else {
      const denom = currentEmi - outstanding * r2;
      if (denom > 0) {
        newMonths = Math.ceil(Math.log(currentEmi / denom) / Math.log(1 + r2));
      }
    }
  }
  newMonths = Math.min(newMonths, remainingMonths);
  const keepEmiInterestSaved = Math.round(
    oldInterest - interestOver(outstanding, r2, currentEmi, newMonths),
  );

  return {
    currentEmi,
    totalFees,
    sameTenure: {
      newEmi,
      monthlySaving,
      grossSaving,
      netSaving: sameTenureNet,
      breakEvenMonth,
    },
    keepEmi: {
      newMonths,
      monthsSaved: remainingMonths - newMonths,
      interestSaved: keepEmiInterestSaved,
      netSaving: keepEmiInterestSaved - totalFees,
    },
    noBenefit: newRate >= currentRate || sameTenureNet <= 0,
  };
}
