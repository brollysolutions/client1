"use client";

import { useMemo } from "react";
import { parseAsFloat, parseAsInteger, useQueryStates } from "nuqs";

import { INFO } from "@/lib/calculators/glossary";
import { prepayment } from "@/lib/finance";
import { formatINR } from "@/lib/format";
import { InfoHint } from "../info-hint";
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

// Prepayment calculator: drop a lump sum partway through a running loan and
// compare the two ways a lender lets you use it, cut the tenure or cut the EMI.
// State lives in the URL through nuqs so results are shareable and deep links
// hydrate correctly.
export function PrepaymentCalculator() {
  const [state, setState] = useQueryStates(
    {
      amount: parseAsInteger.withDefault(3000000),
      rate: parseAsFloat.withDefault(8.5),
      months: parseAsInteger.withDefault(240),
      at: parseAsInteger.withDefault(24),
      lump: parseAsInteger.withDefault(500000),
    },
    { history: "replace", clearOnDefault: true },
  );

  const amount = clamp(state.amount, 100000, 50000000);
  const rate = clamp(state.rate, 5, 18);
  const months = clamp(state.months, 12, 360);
  const at = clamp(state.at, 1, months);
  const lump = clamp(state.lump, 0, amount);

  const result = useMemo(
    () =>
      prepayment({
        principal: amount,
        annualRate: rate,
        months,
        prepayAtMonth: at,
        lumpSum: lump,
      }),
    [amount, rate, months, at, lump],
  );

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Inputs */}
      <div className="grid content-start gap-6">
        <SliderField
          id="prepay-amount"
          label="Loan amount"
          info={INFO.loanAmount}
          prefix="₹"
          value={amount}
          min={100000}
          max={50000000}
          step={50000}
          onChange={(v) => setState({ amount: Math.round(v) })}
          helper={formatINR(amount)}
        />
        <SliderField
          id="prepay-rate"
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
          id="prepay-months"
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
        <SliderField
          id="prepay-at"
          label="Prepay after"
          info={INFO.prepayAfter}
          suffix="months"
          value={at}
          min={1}
          max={months}
          step={1}
          onChange={(v) => setState({ at: Math.round(v) })}
          helper={tenureHelper(at)}
        />
        <SliderField
          id="prepay-lump"
          label="Lump sum"
          info={INFO.lumpSum}
          prefix="₹"
          value={lump}
          min={0}
          max={amount}
          step={25000}
          onChange={(v) => setState({ lump: Math.round(v) })}
          helper={formatINR(lump)}
        />
        <RateDisclaimer />
      </div>

      {/* Results */}
      <div className="grid content-start gap-6">
        <ResultCard
          emphasis
          label="Outstanding before prepay"
          info={INFO.outstandingBefore}
          value={formatINR(result.outstandingBefore)}
          sub={`Regular EMI ${formatINR(result.regularEmi)}`}
        />

        {result.guardTriggered ? (
          <div className="rounded-xl border border-[var(--nav-border)] bg-white p-5">
            <p className="text-sm text-text-secondary">
              The EMI here is too low to model a prepayment cleanly. Try a larger loan, a shorter
              tenure, or a smaller lump sum.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="min-w-0 rounded-xl border border-[var(--nav-border)] bg-white p-5">
                <p className="font-heading text-base font-semibold text-[var(--nav-text)]">
                  Option A: Reduce tenure
                </p>
                <div className="mt-3 flex items-center gap-1.5">
                  <p className="text-sm text-text-secondary">New tenure</p>
                  <InfoHint label="New tenure" text={INFO.newTenureAfterPrepay} />
                </div>
                <p className="mt-1 whitespace-nowrap font-heading text-xl font-semibold tabular-nums text-[var(--nav-text)]">
                  {tenureHelper(result.reduceTenure.newMonths)}
                </p>
                <div className="mt-3 flex items-center gap-1.5">
                  <p className="text-sm text-text-secondary">Interest saved</p>
                  <InfoHint label="Interest saved" text={INFO.interestSavedTenure} />
                </div>
                <p className="mt-1 whitespace-nowrap font-heading text-xl font-semibold tabular-nums text-brand-blue">
                  {formatINR(result.reduceTenure.interestSaved)}
                </p>
              </div>

              <div className="min-w-0 rounded-xl border border-[var(--nav-border)] bg-white p-5">
                <p className="font-heading text-base font-semibold text-[var(--nav-text)]">
                  Option B: Reduce EMI
                </p>
                <div className="mt-3 flex items-center gap-1.5">
                  <p className="text-sm text-text-secondary">New EMI</p>
                  <InfoHint label="New EMI" text={INFO.newEmiAfterPrepay} />
                </div>
                <p className="mt-1 whitespace-nowrap font-heading text-xl font-semibold tabular-nums text-[var(--nav-text)]">
                  {formatINR(result.reduceEmi.newEmi)}
                </p>
                <div className="mt-3 flex items-center gap-1.5">
                  <p className="text-sm text-text-secondary">Interest saved</p>
                  <InfoHint label="Interest saved" text={INFO.interestSavedEmi} />
                </div>
                <p className="mt-1 whitespace-nowrap font-heading text-xl font-semibold tabular-nums text-brand-blue">
                  {formatINR(result.reduceEmi.interestSaved)}
                </p>
              </div>
            </div>
            <p className="text-sm text-text-secondary">
              Keeping the EMI the same and cutting the tenure usually saves more interest.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
