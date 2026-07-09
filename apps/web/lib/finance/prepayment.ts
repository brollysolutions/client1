import { emi as calcEmi, monthlyRate } from "./emi";

export interface PrepaymentInputs {
  principal: number;
  annualRate: number;
  months: number;
  /** Installment number after which the lump sum is paid. */
  prepayAtMonth: number;
  lumpSum: number;
}

export interface PrepaymentResult {
  regularEmi: number;
  /** Outstanding balance just before the lump sum is applied. */
  outstandingBefore: number;
  /** Keep the EMI, shorten the loan. */
  reduceTenure: { newMonths: number; monthsSaved: number; interestSaved: number };
  /** Keep the tenure, lower the EMI. */
  reduceEmi: { newEmi: number; interestSaved: number };
  /**
   * True when the EMI is too small to ever amortize the balance (EMI <= B*r).
   * The reduce-tenure math is undefined here, so the caller should warn instead
   * of showing a number.
   */
  guardTriggered: boolean;
}

// Interest paid over a run of `months` installments, by simulation. Robust to
// the rounding rules used elsewhere and to early payoff.
function interestOver(balance: number, r: number, emiAmount: number, months: number): number {
  let bal = balance;
  let interestSum = 0;
  const cap = Math.min(months, 1200); // safety bound; real tenures are <= 480
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
 * Impact of a one-time part-payment, both ways: reduce the tenure (keep the EMI)
 * or reduce the EMI (keep the tenure). Reduce-tenure almost always saves more
 * interest, which the copy should note.
 */
export function prepayment({
  principal,
  annualRate,
  months,
  prepayAtMonth,
  lumpSum,
}: PrepaymentInputs): PrepaymentResult {
  const r = monthlyRate(annualRate);
  const regularEmi = calcEmi(principal, annualRate, months);

  // Balance after `k` regular EMIs.
  const k = Math.max(0, Math.min(prepayAtMonth, months));
  let balance = principal;
  for (let i = 0; i < k; i++) {
    const interest = r === 0 ? 0 : balance * r;
    balance = balance + interest - regularEmi;
    if (balance < 0) balance = 0;
  }
  const outstandingBefore = Math.round(balance);
  const afterLump = Math.max(0, balance - lumpSum);
  const remainingMonths = months - k;

  const origRemainingInterest = interestOver(balance, r, regularEmi, remainingMonths);

  // Reduce tenure: keep EMI, solve for the new remaining months.
  let newRemaining = remainingMonths;
  let guard = false;
  if (afterLump <= 0) {
    newRemaining = 0;
  } else if (r === 0) {
    newRemaining = Math.ceil(afterLump / regularEmi);
  } else {
    const denom = regularEmi - afterLump * r;
    if (denom <= 0) {
      guard = true; // EMI can't cover the interest on the (still large) balance
    } else {
      newRemaining = Math.ceil(Math.log(regularEmi / denom) / Math.log(1 + r));
    }
  }
  const tenureInterest = guard
    ? origRemainingInterest
    : interestOver(afterLump, r, regularEmi, newRemaining);

  // Reduce EMI: keep the remaining months, solve for the new EMI.
  const newEmi =
    afterLump <= 0
      ? 0
      : r === 0
        ? Math.round(afterLump / remainingMonths)
        : calcEmi(afterLump, annualRate, remainingMonths);
  const emiInterest = interestOver(afterLump, r, newEmi, remainingMonths);

  return {
    regularEmi,
    outstandingBefore,
    reduceTenure: {
      newMonths: guard ? months : k + newRemaining,
      monthsSaved: guard ? 0 : months - (k + newRemaining),
      interestSaved: guard ? 0 : Math.round(origRemainingInterest - tenureInterest),
    },
    reduceEmi: {
      newEmi,
      interestSaved: Math.round(origRemainingInterest - emiInterest),
    },
    guardTriggered: guard,
  };
}
