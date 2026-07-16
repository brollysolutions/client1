"use client";

import { useMemo } from "react";
import {
  parseAsFloat,
  parseAsInteger,
  useQueryStates,
} from "nuqs";

import { INFO } from "@/lib/calculators/glossary";
import { loanEligibility } from "@/lib/finance";
import { formatCompactINR, formatINR } from "@/lib/format";
import { RateDisclaimer } from "../rate-disclaimer";
import { ResultCard } from "../result-card";
import { SliderField } from "../slider-field";

function clamp(value: number, min: number, _max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, value); // `max` is a soft slider ceiling, not a hard cap
}

function tenureHelper(months: number): string {
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0) return `${months} months`;
  return rem ? `${years} yr ${rem} mo` : `${years} years`;
}

// Loan eligibility: how much a lender may sanction given income, existing
// obligations, and the FOIR rule. Inputs feed the pure engine via useMemo and
// all state lives in the URL through nuqs, so results are shareable.
export function LoanEligibilityCalculator() {
  const [state, setState] = useQueryStates(
    {
      inc: parseAsInteger.withDefault(100000),
      emi: parseAsInteger.withDefault(0),
      foir: parseAsInteger.withDefault(50),
      rate: parseAsFloat.withDefault(8.5),
      months: parseAsInteger.withDefault(240),
    },
    { history: "replace", clearOnDefault: true },
  );

  const inc = clamp(state.inc, 10000, 1000000);
  const emi = clamp(state.emi, 0, 500000);
  const foir = clamp(state.foir, 30, 55);
  const rate = clamp(state.rate, 5, 18);
  const months = clamp(state.months, 12, 360);

  const result = useMemo(
    () =>
      loanEligibility({
        netMonthlyIncome: inc,
        annualRate: rate,
        months,
        foir: foir / 100,
        existingEmis: emi,
        multiplier: 60,
      }),
    [inc, rate, months, foir, emi],
  );

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Inputs */}
      <div className="grid content-start gap-6">
        <SliderField
          id="elig-inc"
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
          id="elig-emi"
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
          id="elig-foir"
          label="FOIR"
          info={INFO.foir}
          suffix="%"
          value={foir}
          min={30}
          max={55}
          step={1}
          onChange={(v) => setState({ foir: Math.round(v) })}
          helper={`${foir}% of income`}
        />
        <SliderField
          id="elig-rate"
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
          id="elig-months"
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
        <ResultCard
          emphasis
          label="You may be eligible for"
          info={INFO.eligibleAmount}
          value={formatINR(result.sanctioned)}
          sub="Lower of the two limits below"
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <ResultCard
            label="Max affordable EMI"
            info={INFO.maxAffordableEmi}
            value={formatINR(result.maxEmi)}
          />
          <ResultCard
            label="Limit by income rule (FOIR)"
            info={INFO.limitFoir}
            value={formatCompactINR(result.maxLoanFoir)}
          />
          <ResultCard
            label="Limit by income multiple"
            info={INFO.limitMultiple}
            value={formatCompactINR(result.maxLoanMultiplier)}
          />
        </div>
      </div>
    </div>
  );
}
