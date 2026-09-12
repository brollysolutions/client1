"use client";

import { useMemo } from "react";
import {
  parseAsFloat,
  parseAsInteger,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { INFO } from "@/lib/calculators/glossary";
import { LOAN_DEFAULTS } from "@/lib/calculators/rates";
import { amortizationSchedule } from "@/lib/finance";
import { scheduleExport } from "@/lib/calculators/export";
import { formatCompactINR, formatINR } from "@/lib/format";
import { AmortizationTable } from "../amortization-table";
import { DonutChart } from "../donut-chart";
import { ExportShareBar } from "../export-share-bar";
import { RateDisclaimer } from "../rate-disclaimer";
import { ResultCard } from "../result-card";
import { SliderField } from "../slider-field";

// Order and labels mirror the advertised loan products (lib/products.ts) so a
// visitor coming from /loans sees the same names. Keys match LOAN_DEFAULTS.
const TYPES = ["personal", "business", "property", "vehicle", "education"] as const;
type LoanType = (typeof TYPES)[number];
const TYPE_LABELS: Record<LoanType, string> = {
  personal: "Personal",
  business: "Business",
  property: "Property",
  vehicle: "Vehicle",
  education: "Education",
};

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

// The EMI calculator, and the reference island every other calculator follows:
// inputs -> pure engine (via useMemo) -> result cards + donut + schedule +
// export. All state lives in the URL through nuqs, so results are shareable and
// deep links hydrate correctly.
export function EmiCalculator() {
  const [state, setState] = useQueryStates(
    {
      type: parseAsStringLiteral(TYPES).withDefault("property"),
      amount: parseAsInteger.withDefault(LOAN_DEFAULTS.property.amount),
      rate: parseAsFloat.withDefault(LOAN_DEFAULTS.property.rate),
      months: parseAsInteger.withDefault(LOAN_DEFAULTS.property.months),
    },
    { history: "replace", clearOnDefault: true },
  );

  const bounds = LOAN_DEFAULTS[state.type];
  // Amount is uncapped above the slider ceiling (see allowAboveMax) so any EMI
  // is computable; still floored at amountMin. Rate and tenure stay clamped to
  // sane ranges.
  const amount = clamp(state.amount, bounds.amountMin, Infinity);
  const rate = clamp(state.rate, bounds.rateMin, bounds.rateMax);
  const months = clamp(state.months, bounds.monthsMin, bounds.monthsMax);

  const schedule = useMemo(
    () => amortizationSchedule({ principal: amount, annualRate: rate, months }),
    [amount, rate, months],
  );

  function selectType(next: string) {
    const type = next as LoanType;
    const d = LOAN_DEFAULTS[type];
    setState({ type, amount: d.amount, rate: d.rate, months: d.months });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Inputs */}
      <div className="grid content-start gap-6">
        <Tabs value={state.type} onValueChange={selectType}>
          {/* 5 loan types: 3-up on phones (wraps to two rows), single row from sm. */}
          <TabsList className="grid h-auto w-full grid-cols-3 gap-1 sm:grid-cols-5">
            {TYPES.map((t) => (
              <TabsTrigger key={t} value={t} className="h-8">
                {TYPE_LABELS[t]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <SliderField
          id="emi-amount"
          label="Loan amount"
          info={INFO.loanAmount}
          prefix="₹"
          value={amount}
          min={bounds.amountMin}
          max={bounds.amountMax}
          step={bounds.amountStep}
          allowAboveMax
          onChange={(v) => setState({ amount: Math.round(v) })}
          helper={formatINR(amount)}
        />
        <SliderField
          id="emi-rate"
          label="Interest rate"
          info={INFO.interestRate}
          suffix="% p.a."
          value={rate}
          min={bounds.rateMin}
          max={bounds.rateMax}
          step={bounds.rateStep}
          onChange={(v) => setState({ rate: v })}
          helper={`${rate.toFixed(2)}% per year`}
        />
        <SliderField
          id="emi-months"
          label="Tenure"
          info={INFO.tenure}
          suffix="months"
          value={months}
          min={bounds.monthsMin}
          max={bounds.monthsMax}
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
            label="Monthly EMI"
            info={INFO.emi}
            value={formatINR(schedule.emi)}
          />
          <ResultCard
            label="Total interest"
            info={INFO.totalInterest}
            value={formatCompactINR(schedule.totalInterest)}
          />
          <ResultCard
            label="Total payment"
            info={INFO.totalPayment}
            value={formatCompactINR(schedule.totalPayment)}
          />
        </div>
        <div className="rounded-xl border border-[var(--nav-border)] bg-white p-5">
          <DonutChart principal={amount} interest={schedule.totalInterest} />
        </div>
        <ExportShareBar buildExport={() => scheduleExport(schedule, `${TYPE_LABELS[state.type]} loan EMI schedule`)} filename={`emi-schedule-${state.type}.csv`} />
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
