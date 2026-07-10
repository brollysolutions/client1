import { emi as calcEmi, monthlyRate } from "./emi";
import type { AmortRow, EmiInputs, FyRow, Schedule } from "./types";

// Financial-year label for a payment date, Apr-Mar (India). Apr 2026 -> "FY 2026-27".
function fyLabel(date: Date): string {
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? year : year - 1;
  const endYY = String((startYear + 1) % 100).padStart(2, "0");
  return `FY ${startYear}-${endYY}`;
}

function aggregateFy(rows: AmortRow[], start: Date): FyRow[] {
  const buckets = new Map<string, FyRow>();
  const order: string[] = [];
  for (const row of rows) {
    // Payment date of installment i (1-based) is start + (i-1) months.
    const date = new Date(start.getFullYear(), start.getMonth() + (row.index - 1), 1);
    const label = fyLabel(date);
    let bucket = buckets.get(label);
    if (!bucket) {
      bucket = { fyLabel: label, principalPaid: 0, interestPaid: 0, closingBalance: 0 };
      buckets.set(label, bucket);
      order.push(label);
    }
    bucket.principalPaid += row.principal;
    bucket.interestPaid += row.interest;
    bucket.closingBalance = row.closingBalance; // last row of the FY wins
  }
  return order.map((label) => buckets.get(label)!);
}

/**
 * Full reducing-balance amortization schedule.
 *
 * Everything is integer rupees. Each month's interest is rounded to the rupee,
 * principal is the remainder of the regular EMI, and the final installment is
 * forced to `principal = prior balance` so the closing balance lands on exactly
 * 0 (no stray +/- rupee from accumulated rounding). Because the schedule is
 * built by telescoping the balance down to 0, `sum(principal) === principal` and
 * `sum(interest) === totalInterest` hold by construction.
 *
 * `startDate` seeds the financial-year buckets; tests pass a fixed date for
 * determinism, the UI defaults to today.
 */
export function amortizationSchedule(
  { principal, annualRate, months }: EmiInputs,
  opts?: { startDate?: Date },
): Schedule {
  const regularEmi = calcEmi(principal, annualRate, months);
  const r = monthlyRate(annualRate);
  const start = opts?.startDate ?? new Date();

  const rows: AmortRow[] = [];
  let balance = principal;
  for (let i = 1; i <= months && balance > 0; i++) {
    const openingBalance = balance;
    const interest = r === 0 ? 0 : Math.round(openingBalance * r);
    let principalPaid = regularEmi - interest;
    let emiThis = regularEmi;
    // Settle on the last scheduled month, or early if the regular principal
    // would overshoot the outstanding balance.
    if (i === months || principalPaid >= openingBalance) {
      principalPaid = openingBalance;
      emiThis = principalPaid + interest;
    }
    balance = openingBalance - principalPaid;
    rows.push({
      index: i,
      openingBalance,
      emi: emiThis,
      interest,
      principal: principalPaid,
      closingBalance: balance,
    });
  }

  const totalPayment = rows.reduce((sum, row) => sum + row.emi, 0);
  const totalInterest = rows.reduce((sum, row) => sum + row.interest, 0);

  return {
    emi: regularEmi,
    totalPayment,
    totalInterest,
    rows,
    fyRows: aggregateFy(rows, start),
  };
}
