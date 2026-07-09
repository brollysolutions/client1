import { reverseEmi } from "./reverse";

export interface AffordabilityInputs {
  netMonthlyIncome: number;
  annualRate: number;
  months: number;
  /** Cash the buyer can put down. */
  downPayment: number;
  foir?: number;
  existingEmis?: number;
  /** Max loan-to-value the lender allows on the property. */
  ltv?: number;
}

export interface AffordabilityResult {
  maxEmi: number;
  maxLoan: number;
  maxProperty: number;
}

/**
 * How much house a buyer can afford: the income (FOIR) allows a maximum loan,
 * the down payment adds to it, but the loan may not exceed `ltv` of the property
 * value. The affordable property price is the largest value satisfying both the
 * income cap and the LTV cap.
 */
export function affordability({
  netMonthlyIncome,
  annualRate,
  months,
  downPayment,
  foir = 0.5,
  existingEmis = 0,
  ltv = 0.8,
}: AffordabilityInputs): AffordabilityResult {
  const maxEmi = Math.max(0, Math.round(netMonthlyIncome * foir - existingEmis));
  const maxLoanByIncome = reverseEmi(maxEmi, annualRate, months);

  // If the whole income-based loan fits under the LTV cap for (loan + downPayment),
  // the buyer is income-limited. Otherwise they're LTV-limited and the property
  // price is bounded by how far the down payment stretches: dp = (1 - ltv) * price.
  let loan = maxLoanByIncome;
  let property = loan + downPayment;
  if (ltv > 0 && ltv < 1 && loan > ltv * property) {
    property = Math.round(downPayment / (1 - ltv));
    loan = Math.round(property - downPayment);
    if (loan > maxLoanByIncome) {
      loan = maxLoanByIncome;
      property = loan + downPayment;
    }
  }

  return {
    maxEmi,
    maxLoan: Math.round(loan),
    maxProperty: Math.round(property),
  };
}
