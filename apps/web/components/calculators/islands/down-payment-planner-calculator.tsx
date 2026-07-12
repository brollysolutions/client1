"use client";

import { useMemo } from "react";
import { parseAsFloat, parseAsInteger, useQueryStates } from "nuqs";

import { INFO } from "@/lib/calculators/glossary";
import { sipForGoal } from "@/lib/finance";
import { formatCompactINR, formatINR } from "@/lib/format";
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

// Down payment planner: work backwards from a property price and target down
// payment percentage to the monthly saving needed to get there in time. All
// state lives in the URL through nuqs, so plans are shareable and deep links
// hydrate correctly.
export function DownPaymentPlannerCalculator() {
  const [state, setState] = useQueryStates(
    {
      value: parseAsInteger.withDefault(5000000),
      pct: parseAsInteger.withDefault(20),
      months: parseAsInteger.withDefault(36),
      ret: parseAsFloat.withDefault(8),
    },
    { history: "replace", clearOnDefault: true },
  );

  const value = clamp(state.value, 500000, 200000000);
  const pct = clamp(state.pct, 10, 50);
  const months = clamp(state.months, 6, 120);
  const ret = clamp(state.ret, 0, 15);

  const { downPayment, monthlySip, loanNeeded } = useMemo(() => {
    const downPayment = Math.round((value * pct) / 100);
    return {
      downPayment,
      monthlySip: sipForGoal(downPayment, ret, months),
      loanNeeded: value - downPayment,
    };
  }, [value, pct, months, ret]);

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Inputs */}
      <div className="grid content-start gap-6">
        <SliderField
          id="dp-value"
          label="Property value"
          info={INFO.propertyValue}
          prefix="₹"
          value={value}
          min={500000}
          max={200000000}
          step={100000}
          onChange={(v) => setState({ value: Math.round(v) })}
          helper={formatCompactINR(value)}
        />
        <SliderField
          id="dp-pct"
          label="Down payment"
          info={INFO.downPaymentPct}
          suffix="%"
          value={pct}
          min={10}
          max={50}
          step={1}
          onChange={(v) => setState({ pct: Math.round(v) })}
          helper={`${pct}% of price`}
        />
        <SliderField
          id="dp-months"
          label="Months to goal"
          info={INFO.monthsToGoal}
          suffix="months"
          value={months}
          min={6}
          max={120}
          step={1}
          onChange={(v) => setState({ months: Math.round(v) })}
          helper={tenureHelper(months)}
        />
        <SliderField
          id="dp-ret"
          label="Expected return on savings"
          info={INFO.expectedReturn}
          suffix="% p.a."
          value={ret}
          min={0}
          max={15}
          step={0.5}
          onChange={(v) => setState({ ret: v })}
          helper={`${ret.toFixed(2)}% per year`}
        />
      </div>

      {/* Results */}
      <div className="grid content-start gap-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <ResultCard
            emphasis
            label="Save each month"
            info={INFO.saveEachMonth}
            value={formatINR(monthlySip)}
          />
          <ResultCard
            label="Down payment target"
            info={INFO.downPaymentTarget}
            value={formatCompactINR(downPayment)}
          />
          <ResultCard
            label="Loan you will need"
            info={INFO.loanNeeded}
            value={formatCompactINR(loanNeeded)}
          />
        </div>
        <p className="text-sm text-text-secondary">
          Budget for stamp duty and registration on top of the down payment.
        </p>
      </div>
    </div>
  );
}
