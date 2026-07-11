"use client";

import { useMemo } from "react";
import { parseAsFloat, parseAsInteger, useQueryStates } from "nuqs";

import { INFO } from "@/lib/calculators/glossary";
import { futureValue } from "@/lib/finance";
import { formatCompactINR, formatPercent } from "@/lib/format";
import { ResultCard } from "../result-card";
import { SliderField } from "../slider-field";

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function yearsHelper(years: number): string {
  return years === 1 ? "1 year" : `${years} years`;
}

// Property appreciation: project what a property might be worth after a holding
// period at a steady annual growth rate. Pure engine (via useMemo) over clamped
// values, all state in the URL through nuqs so results are shareable.
export function PropertyAppreciationCalculator() {
  const [state, setState] = useQueryStates(
    {
      value: parseAsInteger.withDefault(5000000),
      growth: parseAsFloat.withDefault(7),
      years: parseAsInteger.withDefault(10),
    },
    { history: "replace", clearOnDefault: true },
  );

  const value = clamp(state.value, 100000, 200000000);
  const growth = clamp(state.growth, 0, 20);
  const years = clamp(state.years, 1, 30);

  const { fv, gain, multiple } = useMemo(() => {
    const projected = futureValue(value, growth, years);
    return {
      fv: projected,
      gain: projected - value,
      multiple: value > 0 ? projected / value : 0,
    };
  }, [value, growth, years]);

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Inputs */}
      <div className="grid content-start gap-6">
        <SliderField
          id="appr-value"
          label="Current value"
          info={INFO.currentValue}
          prefix="₹"
          value={value}
          min={100000}
          max={200000000}
          step={100000}
          onChange={(v) => setState({ value: Math.round(v) })}
          helper={formatCompactINR(value)}
        />
        <SliderField
          id="appr-growth"
          label="Expected annual growth"
          info={INFO.growthRate}
          suffix="% p.a."
          value={growth}
          min={0}
          max={20}
          step={0.5}
          onChange={(v) => setState({ growth: v })}
          helper={`${growth.toFixed(2)}% per year`}
        />
        <SliderField
          id="appr-years"
          label="Holding period"
          info={INFO.holdingPeriod}
          suffix="years"
          value={years}
          min={1}
          max={30}
          step={1}
          onChange={(v) => setState({ years: Math.round(v) })}
          helper={yearsHelper(years)}
        />
      </div>

      {/* Results */}
      <div className="grid content-start gap-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <ResultCard
            emphasis
            label="Future value"
            info={INFO.futureValue}
            value={formatCompactINR(fv)}
          />
          <ResultCard
            label="Total gain"
            info={INFO.totalGain}
            value={formatCompactINR(gain)}
          />
          <ResultCard
            label="Growth"
            info={INFO.growthPerYear}
            value={formatPercent(growth)}
            sub="per year"
          />
        </div>
        <p className="text-sm text-text-secondary">
          Grows to {multiple.toFixed(2)}x over {yearsHelper(years)}. Shows gross appreciation, before
          buying costs and tax.
        </p>
      </div>
    </div>
  );
}
