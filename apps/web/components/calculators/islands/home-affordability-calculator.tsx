"use client";

import { useMemo } from "react";
import { parseAsFloat, parseAsInteger, useQueryStates } from "nuqs";

import { INFO } from "@/lib/calculators/glossary";
import { affordability } from "@/lib/finance";
import { formatCompactINR, formatINR } from "@/lib/format";
import { RateDisclaimer } from "../rate-disclaimer";
import { ResultCard } from "../result-card";
import { SliderField } from "../slider-field";

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function tenureHelper(months: number): string {
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0) return `${months} months`;
  return rem ? `${years} yr ${rem} mo` : `${years} years`;
}

// Home affordability: net income, existing EMIs, down payment, rate, and tenure
// feed the pure affordability engine to show the price band a buyer can target.
// State lives in the URL through nuqs, so results are shareable and deep links
// hydrate correctly.
export function HomeAffordabilityCalculator() {
  const [state, setState] = useQueryStates(
    {
      inc: parseAsInteger.withDefault(100000),
      emi: parseAsInteger.withDefault(0),
      dp: parseAsInteger.withDefault(1500000),
      rate: parseAsFloat.withDefault(8.5),
      months: parseAsInteger.withDefault(240),
    },
    { history: "replace", clearOnDefault: true },
  );

  const inc = clamp(state.inc, 10000, 1000000);
  const emi = clamp(state.emi, 0, 500000);
  const dp = clamp(state.dp, 0, 50000000);
  const rate = clamp(state.rate, 5, 18);
  const months = clamp(state.months, 12, 360);

  const result = useMemo(
    () =>
      affordability({
        netMonthlyIncome: inc,
        annualRate: rate,
        months,
        downPayment: dp,
        existingEmis: emi,
        foir: 0.5,
        ltv: 0.8,
      }),
    [inc, rate, months, dp, emi],
  );

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Inputs */}
      <div className="grid content-start gap-6">
        <SliderField
          id="afford-inc"
          label="Net monthly income"
          info={INFO.netMonthlyIncome}
          prefix="₹"
          value={inc}
          min={10000}
          max={1000000}
          step={5000}
          onChange={(v) => setState({ inc: Math.round(v) })}
          helper={formatINR(inc)}
        />
        <SliderField
          id="afford-emi"
          label="Existing EMIs"
          info={INFO.existingEmis}
          prefix="₹"
          value={emi}
          min={0}
          max={500000}
          step={1000}
          onChange={(v) => setState({ emi: Math.round(v) })}
          helper={formatINR(emi)}
        />
        <SliderField
          id="afford-dp"
          label="Down payment"
          info={INFO.downPayment}
          prefix="₹"
          value={dp}
          min={0}
          max={50000000}
          step={50000}
          onChange={(v) => setState({ dp: Math.round(v) })}
          helper={formatCompactINR(dp)}
        />
        <SliderField
          id="afford-rate"
          label="Interest rate"
          info={INFO.interestRate}
          suffix="% p.a."
          value={rate}
          min={5}
          max={18}
          step={0.05}
          onChange={(v) => setState({ rate: v })}
          helper={`${rate.toFixed(2)}% per year`}
        />
        <SliderField
          id="afford-months"
          label="Tenure"
          info={INFO.tenure}
          suffix="months"
          value={months}
          min={12}
          max={360}
          step={1}
          onChange={(v) => setState({ months: Math.round(v) })}
          helper={tenureHelper(months)}
        />
        <RateDisclaimer />
      </div>

      {/* Results */}
      <div className="grid content-start gap-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <ResultCard
            emphasis
            label="You can afford a home up to"
            info={INFO.maxProperty}
            value={formatCompactINR(result.maxProperty)}
          />
          <ResultCard
            label="Loan you can take"
            info={INFO.loanYouCanTake}
            value={formatCompactINR(result.maxLoan)}
          />
          <ResultCard
            label="Comfortable EMI"
            info={INFO.comfortableEmi}
            value={formatINR(result.maxEmi)}
          />
        </div>
        <p className="text-sm text-text-secondary">
          Stamp duty and registration are extra, on top of the price.
        </p>
      </div>
    </div>
  );
}
