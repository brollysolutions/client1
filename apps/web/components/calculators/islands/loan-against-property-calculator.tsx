"use client";

import { useMemo } from "react";
import { parseAsFloat, parseAsInteger, useQueryStates } from "nuqs";

import { amortizationSchedule, maxLoanFromLtv, type Schedule } from "@/lib/finance";
import { formatCompactINR, formatINR } from "@/lib/format";
import { AmortizationTable } from "../amortization-table";
import { DonutChart } from "../donut-chart";
import { ExportShareBar } from "../export-share-bar";
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

function buildCsv(schedule: Schedule): string {
  const header = "Month,EMI,Principal,Interest,Balance";
  const lines = schedule.rows.map((r) =>
    [r.index, r.emi, r.principal, r.interest, r.closingBalance].join(","),
  );
  return [header, ...lines].join("\n");
}

// Loan against property: pick a property value and how much of it you want to
// borrow, and see the eligible loan, monthly EMI, and the full repayment
// schedule. State lives in the URL through nuqs so results are shareable.
export function LoanAgainstPropertyCalculator() {
  const [state, setState] = useQueryStates(
    {
      value: parseAsInteger.withDefault(10000000),
      ltv: parseAsInteger.withDefault(60),
      rate: parseAsFloat.withDefault(10),
      months: parseAsInteger.withDefault(180),
    },
    { history: "replace", clearOnDefault: true },
  );

  const value = clamp(state.value, 500000, 200000000);
  const ltv = clamp(state.ltv, 40, 70);
  const rate = clamp(state.rate, 8, 16);
  const months = clamp(state.months, 12, 240);

  const { maxLoan, schedule } = useMemo(() => {
    const loan = maxLoanFromLtv(value, ltv / 100);
    return {
      maxLoan: loan,
      schedule: amortizationSchedule({ principal: loan, annualRate: rate, months }),
    };
  }, [value, ltv, rate, months]);

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Inputs */}
      <div className="grid content-start gap-6">
        <SliderField
          id="lap-value"
          label="Property value"
          prefix="₹"
          value={value}
          min={500000}
          max={200000000}
          step={100000}
          onChange={(v) => setState({ value: Math.round(v) })}
          helper={formatCompactINR(value)}
        />
        <SliderField
          id="lap-ltv"
          label="Loan to value"
          suffix="%"
          value={ltv}
          min={40}
          max={70}
          step={1}
          onChange={(v) => setState({ ltv: Math.round(v) })}
          helper={`${ltv}% of value`}
        />
        <SliderField
          id="lap-rate"
          label="Interest rate"
          suffix="% p.a."
          value={rate}
          min={8}
          max={16}
          step={0.05}
          onChange={(v) => setState({ rate: v })}
          helper={`${rate.toFixed(2)}% per year`}
        />
        <SliderField
          id="lap-months"
          label="Tenure"
          suffix="months"
          value={months}
          min={12}
          max={240}
          step={1}
          onChange={(v) => setState({ months: Math.round(v) })}
          helper={tenureHelper(months)}
        />
        <RateDisclaimer />
      </div>

      {/* Results */}
      <div className="grid content-start gap-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <ResultCard emphasis label="Eligible loan" value={formatCompactINR(maxLoan)} />
          <ResultCard label="Monthly EMI" value={formatINR(schedule.emi)} />
          <ResultCard label="Total interest" value={formatCompactINR(schedule.totalInterest)} />
        </div>
        <div className="rounded-xl border border-[var(--nav-border)] bg-white p-5">
          <DonutChart principal={maxLoan} interest={schedule.totalInterest} />
        </div>
        <ExportShareBar buildCsv={() => buildCsv(schedule)} filename="lap-schedule.csv" />
      </div>

      {/* Schedule */}
      <div className="min-w-0 lg:col-span-2">
        <h2 className="font-heading text-xl font-semibold text-[var(--nav-text)]">
          Repayment schedule
        </h2>
        <div className="mt-4">
          <AmortizationTable schedule={schedule} />
        </div>
      </div>
    </div>
  );
}
