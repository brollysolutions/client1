"use client";

import { useMemo } from "react";
import { parseAsFloat, parseAsInteger, useQueryStates } from "nuqs";

import { INFO } from "@/lib/calculators/glossary";
import { BALANCE_TRANSFER_DEFAULTS as D } from "@/lib/calculators/rates";
import { balanceTransfer } from "@/lib/finance";
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

// Balance transfer: what refinancing a running loan at a lower rate saves,
// both ways a lender lets you take it, minus everything the switch costs.
export function BalanceTransferCalculator() {
  const [state, setState] = useQueryStates(
    {
      outstanding: parseAsInteger.withDefault(D.outstanding),
      months: parseAsInteger.withDefault(D.months),
      current: parseAsFloat.withDefault(D.currentRate),
      next: parseAsFloat.withDefault(D.newRate),
      feePct: parseAsFloat.withDefault(D.feePct),
      flatFee: parseAsInteger.withDefault(D.flatFee),
    },
    { history: "replace", clearOnDefault: true },
  );

  const outstanding = clamp(state.outstanding, D.outstandingMin, D.outstandingMax);
  const months = clamp(state.months, D.monthsMin, D.monthsMax);
  const current = clamp(state.current, D.rateMin, D.rateMax);
  const next = clamp(state.next, D.rateMin, D.rateMax);
  const feePct = clamp(state.feePct, D.feePctMin, D.feePctMax);
  const flatFee = clamp(state.flatFee, D.flatFeeMin, D.flatFeeMax);

  const result = useMemo(
    () =>
      balanceTransfer({
        outstanding,
        remainingMonths: months,
        currentRate: current,
        newRate: next,
        processingFeePct: feePct,
        flatFee,
      }),
    [outstanding, months, current, next, feePct, flatFee],
  );

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Inputs */}
      <div className="grid content-start gap-6">
        <SliderField
          id="bt-outstanding"
          label="Outstanding loan"
          info={INFO.btOutstanding}
          prefix="₹"
          value={outstanding}
          min={D.outstandingMin}
          max={D.outstandingMax}
          step={D.outstandingStep}
          allowAboveMax
          onChange={(v) => setState({ outstanding: Math.round(v) })}
          helper={formatINR(outstanding)}
        />
        <SliderField
          id="bt-months"
          label="Remaining tenure"
          info={INFO.btRemainingTenure}
          suffix="months"
          value={months}
          min={D.monthsMin}
          max={D.monthsMax}
          step={1}
          onChange={(v) => setState({ months: Math.round(v) })}
          helper={tenureHelper(months)}
        />
        <SliderField
          id="bt-current"
          label="Current rate"
          info={INFO.btCurrentRate}
          suffix="% p.a."
          value={current}
          min={D.rateMin}
          max={D.rateMax}
          step={D.rateStep}
          onChange={(v) => setState({ current: v })}
          helper={`${current.toFixed(2)}% per year now`}
        />
        <SliderField
          id="bt-next"
          label="New rate offered"
          info={INFO.btNewRate}
          suffix="% p.a."
          value={next}
          min={D.rateMin}
          max={D.rateMax}
          step={D.rateStep}
          onChange={(v) => setState({ next: v })}
          helper={`${next.toFixed(2)}% per year offered`}
        />
        <SliderField
          id="bt-feepct"
          label="Processing fee"
          info={INFO.btFees}
          suffix="%"
          value={feePct}
          min={D.feePctMin}
          max={D.feePctMax}
          step={D.feePctStep}
          onChange={(v) => setState({ feePct: v })}
          helper={`${formatINR(Math.round((outstanding * feePct) / 100))} on this balance`}
        />
        <SliderField
          id="bt-flatfee"
          label="Fixed charges"
          info={INFO.btFees}
          prefix="₹"
          value={flatFee}
          min={D.flatFeeMin}
          max={D.flatFeeMax}
          step={D.flatFeeStep}
          onChange={(v) => setState({ flatFee: Math.round(v) })}
          helper="Stamp, MOD, legal and valuation charges"
        />
        <RateDisclaimer />
      </div>

      {/* Results */}
      <div className="grid content-start gap-6">
        {result.noBenefit ? (
          <div className="rounded-xl border border-[var(--nav-border)] bg-white p-5">
            <p className="font-heading text-base font-semibold text-[var(--nav-text)]">
              This switch does not pay for itself
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              At these rates the fees eat whatever the lower EMI saves. A transfer usually makes
              sense when the new rate is at least half a percent lower and plenty of tenure is
              left.
            </p>
          </div>
        ) : (
          <>
            <ResultCard
              emphasis
              label="Net saving after fees"
              info={INFO.btNetSaving}
              value={formatINR(result.sameTenure.netSaving)}
              sub={`EMI drops ${formatINR(result.sameTenure.monthlySaving)} a month, fees ${formatINR(result.totalFees)}`}
            />
            {result.sameTenure.breakEvenMonth !== null ? (
              <ResultCard
                label="Fees recovered by"
                info={INFO.btBreakEven}
                value={`Month ${result.sameTenure.breakEvenMonth}`}
                sub="EMI savings pay back the switching costs"
              />
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="min-w-0 rounded-xl border border-[var(--nav-border)] bg-white p-5">
                <p className="font-heading text-base font-semibold text-[var(--nav-text)]">
                  Option A: Lower the EMI
                </p>
                <div className="mt-3 flex items-center gap-1.5">
                  <p className="text-sm text-text-secondary">New EMI</p>
                  <InfoHint label="New EMI" text={INFO.btMonthlySaving} />
                </div>
                <p className="mt-1 whitespace-nowrap font-heading text-xl font-semibold tabular-nums text-[var(--nav-text)]">
                  {formatINR(result.sameTenure.newEmi)}
                </p>
                <div className="mt-3 flex items-center gap-1.5">
                  <p className="text-sm text-text-secondary">Saved after fees</p>
                  <InfoHint label="Saved after fees" text={INFO.btNetSaving} />
                </div>
                <p className="mt-1 whitespace-nowrap font-heading text-xl font-semibold tabular-nums text-brand-blue">
                  {formatINR(result.sameTenure.netSaving)}
                </p>
              </div>

              <div className="min-w-0 rounded-xl border border-[var(--nav-border)] bg-white p-5">
                <p className="font-heading text-base font-semibold text-[var(--nav-text)]">
                  Option B: Keep the EMI
                </p>
                <div className="mt-3 flex items-center gap-1.5">
                  <p className="text-sm text-text-secondary">New tenure</p>
                  <InfoHint label="New tenure" text={INFO.btRemainingTenure} />
                </div>
                <p className="mt-1 whitespace-nowrap font-heading text-xl font-semibold tabular-nums text-[var(--nav-text)]">
                  {tenureHelper(result.keepEmi.newMonths)}
                </p>
                <div className="mt-3 flex items-center gap-1.5">
                  <p className="text-sm text-text-secondary">Saved after fees</p>
                  <InfoHint label="Saved after fees" text={INFO.btNetSaving} />
                </div>
                <p className="mt-1 whitespace-nowrap font-heading text-xl font-semibold tabular-nums text-brand-blue">
                  {formatINR(result.keepEmi.netSaving)}
                </p>
              </div>
            </div>
            <p className="text-sm text-text-secondary">
              Option A eases your monthly budget. Option B keeps paying the old EMI at the new rate
              and closes the loan {tenureHelper(result.keepEmi.monthsSaved)} early, which saves
              more in total.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
