"use client";

import { useMemo } from "react";
import { parseAsFloat, parseAsInteger, useQueryStates } from "nuqs";

import { INFO } from "@/lib/calculators/glossary";
import { RENT_VS_BUY_DEFAULTS as D } from "@/lib/calculators/rates";
import { rentVsBuy } from "@/lib/finance";
import { rentVsBuyExport } from "@/lib/calculators/export";
import { formatCompactINR, formatINR } from "@/lib/format";
import { ExportShareBar } from "../export-share-bar";
import { RateDisclaimer } from "../rate-disclaimer";
import { ResultCard } from "../result-card";
import { SliderField } from "../slider-field";

function clamp(value: number, min: number, _max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, value); // `max` is a soft slider ceiling, not a hard cap
}

// Rent vs buy by terminal wealth: the buyer ends with home equity, the renter
// ends with the invested difference. Whoever holds more at the horizon wins.
export function RentVsBuyCalculator() {
  const [state, setState] = useQueryStates(
    {
      rent: parseAsInteger.withDefault(D.rent),
      rentGrowth: parseAsFloat.withDefault(D.rentGrowth),
      price: parseAsInteger.withDefault(D.price),
      down: parseAsInteger.withDefault(D.downPct),
      rate: parseAsFloat.withDefault(D.loanRate),
      appreciation: parseAsFloat.withDefault(D.appreciation),
      invest: parseAsFloat.withDefault(D.investReturn),
      years: parseAsInteger.withDefault(D.horizon),
    },
    { history: "replace", clearOnDefault: true },
  );

  const rent = clamp(state.rent, D.rentMin, D.rentMax);
  const rentGrowth = clamp(state.rentGrowth, D.rentGrowthMin, D.rentGrowthMax);
  const price = clamp(state.price, D.priceMin, D.priceMax);
  const down = clamp(state.down, D.downPctMin, D.downPctMax);
  const rate = clamp(state.rate, D.loanRateMin, D.loanRateMax);
  const appreciation = clamp(state.appreciation, D.appreciationMin, D.appreciationMax);
  const invest = clamp(state.invest, D.investReturnMin, D.investReturnMax);
  const years = clamp(state.years, D.horizonMin, D.horizonMax);

  const result = useMemo(
    () =>
      rentVsBuy({
        monthlyRent: rent,
        rentGrowth,
        propertyPrice: price,
        downPaymentPct: down,
        loanRate: rate,
        appreciation,
        investmentReturn: invest,
        horizonYears: years,
      }),
    [rent, rentGrowth, price, down, rate, appreciation, invest, years],
  );

  const ahead = Math.abs(result.buyAdvantageAtHorizon);
  const verdict =
    result.cheaper === "buy"
      ? `Buying leaves you ${formatCompactINR(ahead)} ahead over ${years} years`
      : `Renting leaves you ${formatCompactINR(ahead)} ahead over ${years} years`;

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Inputs */}
      <div className="grid content-start gap-6">
        <SliderField
          id="rvb-rent"
          label="Monthly rent today"
          info={INFO.rentYouPay}
          prefix="₹"
          value={rent}
          min={D.rentMin}
          max={D.rentMax}
          step={D.rentStep}
          onChange={(v) => setState({ rent: Math.round(v) })}
          helper={formatINR(rent)}
        />
        <SliderField
          id="rvb-rent-growth"
          label="Rent increase"
          info={INFO.rentGrowth}
          suffix="%/yr"
          value={rentGrowth}
          min={D.rentGrowthMin}
          max={D.rentGrowthMax}
          step={0.5}
          onChange={(v) => setState({ rentGrowth: v })}
          helper={`${rentGrowth.toFixed(1)}% every year`}
        />
        <SliderField
          id="rvb-price"
          label="Property price"
          info={INFO.propertyValue}
          prefix="₹"
          value={price}
          min={D.priceMin}
          max={D.priceMax}
          step={D.priceStep}
          allowAboveMax
          onChange={(v) => setState({ price: Math.round(v) })}
          helper={formatINR(price)}
        />
        <SliderField
          id="rvb-down"
          label="Down payment"
          info={INFO.ltv}
          suffix="%"
          value={down}
          min={D.downPctMin}
          max={D.downPctMax}
          step={1}
          onChange={(v) => setState({ down: Math.round(v) })}
          helper={`${formatINR(Math.round((price * down) / 100))} upfront`}
        />
        <SliderField
          id="rvb-rate"
          label="Home loan rate"
          info={INFO.interestRate}
          suffix="% p.a."
          value={rate}
          min={D.loanRateMin}
          max={D.loanRateMax}
          step={D.loanRateStep}
          onChange={(v) => setState({ rate: v })}
          helper={`EMI ${formatINR(result.emi)} on a 20 year loan`}
        />
        <SliderField
          id="rvb-appreciation"
          label="Property appreciation"
          info={INFO.appreciationRate}
          suffix="%/yr"
          value={appreciation}
          min={D.appreciationMin}
          max={D.appreciationMax}
          step={0.5}
          onChange={(v) => setState({ appreciation: v })}
          helper={`${appreciation.toFixed(1)}% growth a year`}
        />
        <SliderField
          id="rvb-invest"
          label="Your investment return"
          info={INFO.investmentReturn}
          suffix="%/yr"
          value={invest}
          min={D.investReturnMin}
          max={D.investReturnMax}
          step={0.5}
          onChange={(v) => setState({ invest: v })}
          helper={`${invest.toFixed(1)}% if you invest instead`}
        />
        <SliderField
          id="rvb-years"
          label="How long you will stay"
          info={INFO.rvbHorizon}
          suffix="years"
          value={years}
          min={D.horizonMin}
          max={D.horizonMax}
          step={1}
          onChange={(v) => setState({ years: Math.round(v) })}
          helper={`${years} year horizon`}
        />
        <RateDisclaimer />
      </div>

      {/* Results */}
      <div className="grid content-start gap-6">
        <ResultCard
          emphasis
          label="The verdict"
          info={INFO.buyAdvantage}
          value={result.cheaper === "buy" ? "Buying wins" : "Renting wins"}
          sub={verdict}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <ResultCard
            label="Buyer's wealth"
            info={INFO.homeEquity}
            value={formatCompactINR(result.years.at(-1)?.homeEquity ?? 0)}
            sub="Home value minus loan still owed"
          />
          <ResultCard
            label="Renter's wealth"
            info={INFO.renterCorpus}
            value={formatCompactINR(result.years.at(-1)?.renterCorpus ?? 0)}
            sub="Invested savings at your return"
          />
        </div>
        <ResultCard
          label="Break-even"
          info={INFO.rvbBreakEven}
          value={result.breakEvenYear ? `Year ${result.breakEvenYear}` : "Not in this horizon"}
          sub={
            result.breakEvenYear
              ? "Owning pulls ahead of renting here"
              : "Renting stays ahead for your whole stay"
          }
        />
        <p className="text-sm text-text-secondary">
          Assumes 7% one-time buying costs, 1% a year on maintenance and property tax, and a 20
          year loan. Selling costs, tax breaks, and the rent deposit are not modeled.
        </p>
        <ExportShareBar buildExport={() => rentVsBuyExport(result)} filename="rent-vs-buy-yearly.csv" />
      </div>

      {/* Year by year */}
      <div className="min-w-0 lg:col-span-2">
        <h2 className="font-heading text-xl font-semibold text-[var(--nav-text)]">
          Year by year
        </h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--nav-border)] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--nav-border)] text-left">
                <th className="px-4 py-3 font-medium text-text-secondary">Year</th>
                <th className="px-4 py-3 text-right font-medium text-text-secondary">Rent paid</th>
                <th className="px-4 py-3 text-right font-medium text-text-secondary">
                  Owner outgo
                </th>
                <th className="px-4 py-3 text-right font-medium text-text-secondary">
                  Home equity
                </th>
                <th className="px-4 py-3 text-right font-medium text-text-secondary">
                  Renter corpus
                </th>
                <th className="px-4 py-3 text-right font-medium text-text-secondary">
                  Buy advantage
                </th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {result.years.map((y) => (
                <tr key={y.year} className="border-b border-[var(--nav-border)] last:border-b-0">
                  <td className="px-4 py-2.5 text-[var(--nav-text)]">{y.year}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--nav-text)]">
                    {formatINR(y.rentPaid)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[var(--nav-text)]">
                    {formatINR(y.ownerOutgo)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[var(--nav-text)]">
                    {formatINR(y.homeEquity)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[var(--nav-text)]">
                    {formatINR(y.renterCorpus)}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-medium ${
                      y.buyAdvantage >= 0 ? "text-brand-blue" : "text-text-secondary"
                    }`}
                  >
                    {formatINR(y.buyAdvantage)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
