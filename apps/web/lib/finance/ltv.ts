// RBI loan-to-value bands for home loans, by property value.
//   <= 30 lakh   -> 90%
//   30-75 lakh   -> 80%
//   > 75 lakh    -> 75%
export function homeLtvRatio(propertyValue: number): number {
  if (propertyValue <= 3_000_000) return 0.9;
  if (propertyValue <= 7_500_000) return 0.8;
  return 0.75;
}

export function maxLoanFromLtv(propertyValue: number, ltv: number): number {
  return Math.round(propertyValue * ltv);
}
