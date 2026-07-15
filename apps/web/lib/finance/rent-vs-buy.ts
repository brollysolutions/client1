import { amortizationSchedule } from "./schedule";

export interface RentVsBuyInputs {
  monthlyRent: number;
  /** Rent escalation, percent per year. */
  rentGrowth: number;
  propertyPrice: number;
  downPaymentPct: number;
  loanRate: number;
  /** Property appreciation, percent per year. */
  appreciation: number;
  /** What the renter's money earns instead, percent per year. */
  investmentReturn: number;
  horizonYears: number;
  loanMonths?: number;
  /** One-time buying costs: stamp duty, registration, brokerage. */
  buyingCostsPct?: number;
  /** Upkeep plus property tax, percent of current value per year. */
  maintenancePct?: number;
}

export interface RentVsBuyYearRow {
  year: number;
  /** Rent paid during this year. */
  rentPaid: number;
  /** EMI paid plus maintenance during this year. */
  ownerOutgo: number;
  /** End of year: appreciated value minus the outstanding loan balance. */
  homeEquity: number;
  /** End of year: the renter's invested corpus. */
  renterCorpus: number;
  /** homeEquity - renterCorpus. Positive means buying is ahead. */
  buyAdvantage: number;
}

export interface RentVsBuyResult {
  emi: number;
  loanAmount: number;
  /** Down payment plus buying costs, the cash a buyer parts with on day one. */
  upfrontCash: number;
  years: RentVsBuyYearRow[];
  buyAdvantageAtHorizon: number;
  cheaper: "buy" | "rent";
  /** First year buying pulls ahead. Null when renting stays ahead all horizon. */
  breakEvenYear: number | null;
}

/**
 * Rent vs buy by terminal wealth, the invest-the-difference method. The buyer's
 * wealth at the horizon is home equity: appreciated value MINUS the loan still
 * outstanding (forgetting the balance is the classic error in naive cost
 * comparisons). The renter invests the buyer's upfront cash on day one and,
 * each year, invests whatever the buyer paid beyond rent (EMI + maintenance -
 * rent, which can go negative and become a drawdown once the loan ends).
 * Opportunity cost is therefore counted exactly once, as the renter's corpus.
 *
 * Yearly-step conventions, pinned because each moves the rupee outputs: the
 * corpus compounds a full year, then the year's net difference lands at year
 * end (uncompounded its first year); rent is constant within a year and grows
 * at year end; maintenance is charged on the start-of-year value; the value
 * appreciates at year end; equity is measured at year end; the EMI comes from
 * one amortizationSchedule call so figures agree with the EMI calculator.
 *
 * Not modeled (stated in the page copy): selling costs on exit, tax breaks and
 * LTCG, the rent deposit, home insurance.
 */
export function rentVsBuy({
  monthlyRent,
  rentGrowth,
  propertyPrice,
  downPaymentPct,
  loanRate,
  appreciation,
  investmentReturn,
  horizonYears,
  loanMonths = 240,
  buyingCostsPct = 7,
  maintenancePct = 1,
}: RentVsBuyInputs): RentVsBuyResult {
  const downPayment = Math.round((propertyPrice * downPaymentPct) / 100);
  const buyingCosts = Math.round((propertyPrice * buyingCostsPct) / 100);
  const loanAmount = propertyPrice - downPayment;
  const upfrontCash = downPayment + buyingCosts;

  const schedule =
    loanAmount > 0
      ? amortizationSchedule({ principal: loanAmount, annualRate: loanRate, months: loanMonths })
      : null;

  const years: RentVsBuyYearRow[] = [];
  let rent = monthlyRent;
  let value = propertyPrice;
  let corpus = upfrontCash;

  for (let year = 1; year <= horizonYears; year++) {
    const rentPaid = Math.round(rent * 12);

    // EMI months that fall inside this year, summed off the schedule rows so
    // the final short installment is exact.
    const fromMonth = (year - 1) * 12;
    const toMonth = Math.min(year * 12, loanMonths);
    let emiPaid = 0;
    if (schedule) {
      for (let m = fromMonth; m < toMonth; m++) emiPaid += schedule.rows[m]?.emi ?? 0;
    }
    const maintenance = Math.round((value * maintenancePct) / 100);
    const ownerOutgo = emiPaid + maintenance;

    // Renter: last year's corpus compounds, then this year's difference lands.
    corpus = corpus * (1 + investmentReturn / 100) + (ownerOutgo - rentPaid);

    // Year-end moves: value appreciates, rent escalates for next year.
    value = value * (1 + appreciation / 100);
    rent = rent * (1 + rentGrowth / 100);

    const balance =
      schedule && toMonth < loanMonths ? schedule.rows[toMonth - 1]?.closingBalance ?? 0 : 0;
    const homeEquity = Math.round(value - balance);
    const renterCorpus = Math.round(corpus);

    years.push({
      year,
      rentPaid,
      ownerOutgo,
      homeEquity,
      renterCorpus,
      buyAdvantage: homeEquity - renterCorpus,
    });
  }

  const last = years[years.length - 1];
  const breakEven = years.find((row) => row.buyAdvantage >= 0);

  return {
    emi: schedule?.emi ?? 0,
    loanAmount,
    upfrontCash,
    years,
    buyAdvantageAtHorizon: last?.buyAdvantage ?? 0,
    cheaper: (last?.buyAdvantage ?? 0) >= 0 ? "buy" : "rent",
    breakEvenYear: breakEven?.year ?? null,
  };
}
