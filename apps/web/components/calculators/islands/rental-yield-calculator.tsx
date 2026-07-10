"use client";

import { useMemo } from "react";
import { parseAsInteger, useQueryStates } from "nuqs";

import { rentalYield } from "@/lib/finance";
import { formatCompactINR, formatINR, formatPercent } from "@/lib/format";
import { ResultCard } from "../result-card";
import { SliderField } from "../slider-field";

const VALUE_MIN = 500000;
const VALUE_MAX = 200000000;
const RENT_MIN = 1000;
const RENT_MAX = 2000000;
const EXP_MIN = 0;
const EXP_MAX = 2000000;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

// Rental yield island (real_estate line). Inputs -> pure rentalYield engine
// via useMemo -> result cards. All state lives in the URL through nuqs, so the
// figures are shareable and deep links hydrate correctly.
export function RentalYieldCalculator() {
  const [state, setState] = useQueryStates(
    {
      value: parseAsInteger.withDefault(10000000),
      rent: parseAsInteger.withDefault(30000),
      exp: parseAsInteger.withDefault(60000),
    },
    { history: "replace", clearOnDefault: true },
  );

  const value = clamp(state.value, VALUE_MIN, VALUE_MAX);
  const rent = clamp(state.rent, RENT_MIN, RENT_MAX);
  const exp = clamp(state.exp, EXP_MIN, EXP_MAX);

  const result = useMemo(
    () => rentalYield({ propertyValue: value, monthlyRent: rent, annualExpenses: exp }),
    [value, rent, exp],
  );

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Inputs */}
      <div className="grid content-start gap-6">
        <SliderField
          id="ry-value"
          label="Property value"
          prefix="₹"
          value={value}
          min={VALUE_MIN}
          max={VALUE_MAX}
          step={100000}
          onChange={(v) => setState({ value: Math.round(v) })}
          helper={formatCompactINR(value)}
        />
        <SliderField
          id="ry-rent"
          label="Monthly rent"
          prefix="₹"
          value={rent}
          min={RENT_MIN}
          max={RENT_MAX}
          step={1000}
          onChange={(v) => setState({ rent: Math.round(v) })}
          helper={formatINR(rent)}
        />
        <SliderField
          id="ry-exp"
          label="Annual expenses"
          prefix="₹"
          value={exp}
          min={EXP_MIN}
          max={EXP_MAX}
          step={5000}
          onChange={(v) => setState({ exp: Math.round(v) })}
          helper={formatINR(exp)}
        />
      </div>

      {/* Results */}
      <div className="grid content-start gap-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <ResultCard emphasis label="Net rental yield" value={formatPercent(result.netYield)} />
          <ResultCard label="Gross rental yield" value={formatPercent(result.grossYield)} />
          <ResultCard label="Annual rent" value={formatINR(result.annualRent)} />
        </div>
        <p className="text-sm text-text-secondary">
          In India a net yield above 4 percent is generally considered healthy.
        </p>
      </div>
    </div>
  );
}
