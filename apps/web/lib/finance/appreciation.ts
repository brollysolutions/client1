/** Future value under compound growth: FV = PV * (1 + g)^n. */
export function futureValue(pv: number, annualGrowthPct: number, years: number): number {
  return Math.round(pv * Math.pow(1 + annualGrowthPct / 100, years));
}

/** Compound annual growth rate as a percentage: CAGR = (FV/PV)^(1/n) - 1. */
export function cagr(pv: number, fv: number, years: number): number {
  if (pv <= 0 || years <= 0) return 0;
  return (Math.pow(fv / pv, 1 / years) - 1) * 100;
}
