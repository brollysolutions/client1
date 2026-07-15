export interface TermCoverInputs {
  age: number;
  annualIncome: number;
  monthlyExpenses: number;
  outstandingLoans?: number;
  existingCover?: number;
  liquidAssets?: number;
}

export interface TermCoverResult {
  /** Income-replacement need: income x age-band multiplier, adjusted. */
  incomeMethod: number;
  /** Expense-replacement need: household expenses to age 60, adjusted. */
  expenseMethod: number;
  /** max(both methods), rounded UP to the next 25 lakh slab. 0 when already covered. */
  recommended: number;
  multiplierUsed: number;
  yearsTo60: number;
  adequatelyCovered: boolean;
}

/**
 * Age-banded income multipliers, the method mainstream Indian insurer
 * calculators use. Younger earners need more years of income replaced.
 */
export const TERM_MULTIPLIER_BANDS: ReadonlyArray<{ maxAge: number; multiplier: number }> = [
  { maxAge: 35, multiplier: 25 },
  { maxAge: 45, multiplier: 20 },
  { maxAge: 55, multiplier: 15 },
  { maxAge: Infinity, multiplier: 10 },
];

/** Term cover is sold in 25 lakh slabs; a protection number always rounds up. */
const COVER_SLAB = 2_500_000;

/**
 * How much term life cover a household needs, by the two standard methods:
 * income replacement (annual income x an age-band multiplier) and expense
 * replacement (household expenses to age 60, undiscounted, which quietly
 * assumes investment returns roughly match inflation). Both add outstanding
 * loans and subtract existing cover and liquid assets, so they are comparable
 * side by side. The recommendation takes the larger number and rounds UP to
 * the next 25 lakh, never down: under-covering is the failure mode that
 * matters. Insurers cap issuable cover by income multiples in underwriting,
 * which the calculator copy should note.
 */
export function termCover({
  age,
  annualIncome,
  monthlyExpenses,
  outstandingLoans = 0,
  existingCover = 0,
  liquidAssets = 0,
}: TermCoverInputs): TermCoverResult {
  const band = TERM_MULTIPLIER_BANDS.find((b) => age <= b.maxAge) ?? TERM_MULTIPLIER_BANDS[3];
  const yearsTo60 = Math.max(0, 60 - age);
  const adjustments = outstandingLoans - existingCover - liquidAssets;

  const incomeMethod = Math.max(0, Math.round(annualIncome * band.multiplier + adjustments));
  const expenseMethod = Math.max(0, Math.round(monthlyExpenses * 12 * yearsTo60 + adjustments));

  const raw = Math.max(incomeMethod, expenseMethod);
  const recommended = raw <= 0 ? 0 : Math.ceil(raw / COVER_SLAB) * COVER_SLAB;

  return {
    incomeMethod,
    expenseMethod,
    recommended,
    multiplierUsed: band.multiplier,
    yearsTo60,
    adequatelyCovered: recommended === 0,
  };
}
