"use client";

import { useMemo } from "react";
import { parseAsFloat, parseAsInteger, useQueryStates } from "nuqs";

import { INFO } from "@/lib/calculators/glossary";
import { CARD_EMI_DEFAULTS as D } from "@/lib/calculators/rates";
import { cardEmi } from "@/lib/finance";
import { formatINR } from "@/lib/format";
import { InfoHint } from "../info-hint";
import { RateDisclaimer } from "../rate-disclaimer";
import { ResultCard } from "../result-card";
import { SliderField } from "../slider-field";

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function Row({ label, value, info }: { label: string; value: string; info?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <p className="text-sm text-text-secondary">{label}</p>
        {info ? <InfoHint label={label} text={info} /> : null}
      </div>
      <p className="whitespace-nowrap font-heading text-base font-semibold tabular-nums text-[var(--nav-text)]">
        {value}
      </p>
    </div>
  );
}

// Card EMI conversion: what turning a purchase into EMIs really costs once the
// processing fee and the GST on every month's interest are counted, plus the
// honest effective rate and the keep-revolving comparison.
export function CreditCardEmiCalculator() {
  const [state, setState] = useQueryStates(
    {
      amount: parseAsInteger.withDefault(D.amount),
      rate: parseAsFloat.withDefault(D.rate),
      months: parseAsInteger.withDefault(D.months),
      fee: parseAsInteger.withDefault(D.fee),
    },
    { history: "replace", clearOnDefault: true },
  );

  const amount = clamp(state.amount, D.amountMin, D.amountMax);
  const rate = clamp(state.rate, D.rateMin, D.rateMax);
  const months = clamp(state.months, D.monthsMin, D.monthsMax);
  const fee = clamp(state.fee, D.feeMin, D.feeMax);

  const result = useMemo(
    () => cardEmi({ amount, annualRate: rate, months, processingFee: fee }),
    [amount, rate, months, fee],
  );

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Inputs */}
      <div className="grid content-start gap-6">
        <SliderField
          id="cce-amount"
          label="Amount to convert"
          info={INFO.cardEmiAmount}
          prefix="₹"
          value={amount}
          min={D.amountMin}
          max={D.amountMax}
          step={D.amountStep}
          onChange={(v) => setState({ amount: Math.round(v) })}
          helper={formatINR(amount)}
        />
        <SliderField
          id="cce-rate"
          label="Conversion rate"
          info={INFO.cardEmiRate}
          suffix="% p.a."
          value={rate}
          min={D.rateMin}
          max={D.rateMax}
          step={D.rateStep}
          onChange={(v) => setState({ rate: v })}
          helper={`${rate.toFixed(2)}% per year`}
        />
        <SliderField
          id="cce-months"
          label="Tenure"
          info={INFO.tenure}
          suffix="months"
          value={months}
          min={D.monthsMin}
          max={D.monthsMax}
          step={1}
          onChange={(v) => setState({ months: Math.round(v) })}
          helper={`${months} months`}
        />
        <SliderField
          id="cce-fee"
          label="Processing fee"
          info={INFO.cardProcessingFee}
          prefix="₹"
          value={fee}
          min={D.feeMin}
          max={D.feeMax}
          step={D.feeStep}
          onChange={(v) => setState({ fee: Math.round(v) })}
          helper={`${formatINR(fee)} + 18% GST`}
        />
        <RateDisclaimer />
      </div>

      {/* Results */}
      <div className="grid content-start gap-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <ResultCard
            emphasis
            label="Monthly EMI"
            info={INFO.emi}
            value={formatINR(result.emi)}
            sub={`${formatINR(result.firstMonthOutflow)} in month 1 with GST`}
          />
          <ResultCard
            label="Effective rate"
            info={INFO.effectiveCardRate}
            value={`${result.effectiveAnnualRate.toFixed(2)}%`}
            sub={`vs ${rate.toFixed(2)}% quoted`}
          />
        </div>

        <div className="rounded-xl border border-[var(--nav-border)] bg-white px-5 py-3">
          <Row label="Interest" value={formatINR(result.totalInterest)} info={INFO.totalInterest} />
          <Row
            label="GST on interest"
            value={formatINR(result.gstOnInterest)}
            info={INFO.gstOnCardInterest}
          />
          <Row
            label="Fee with GST"
            value={formatINR(result.feeWithGst)}
            info={INFO.cardProcessingFee}
          />
          <div className="border-t border-[var(--nav-border)]">
            <Row
              label="Total cost"
              value={formatINR(result.totalCost)}
              info={INFO.cardEmiTotalCost}
            />
          </div>
        </div>

        <div className="rounded-xl border border-[var(--nav-border)] bg-white p-5">
          <div className="flex items-center gap-1.5">
            <p className="font-heading text-base font-semibold text-[var(--nav-text)]">
              If you kept revolving instead
            </p>
            <InfoHint label="If you kept revolving" text={INFO.vsRevolving} />
          </div>
          {result.vsRevolving.neverClears ? (
            <p className="mt-2 text-sm text-text-secondary">
              Paying this same EMI against the balance at the card&apos;s normal rate would never
              clear it. The conversion is the only path that ends.
            </p>
          ) : (
            <p className="mt-2 text-sm text-text-secondary">
              Paying the same {formatINR(result.emi)} a month at a typical 42% card rate would take{" "}
              {result.vsRevolving.months} months and cost{" "}
              {formatINR(result.vsRevolving.totalInterest + result.vsRevolving.totalGst)} in
              interest and GST
              {result.vsRevolving.extraCostVsEmi > 0
                ? `, ${formatINR(result.vsRevolving.extraCostVsEmi)} more than converting`
                : ""}
              . No-cost EMI offers work differently and are not modeled here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
