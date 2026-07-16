"use client";

import { useMemo, useState } from "react";

import { INFO } from "@/lib/calculators/glossary";
import { amortizationSchedule } from "@/lib/finance";
import { formatINR } from "@/lib/format";
import { InfoHint } from "../info-hint";
import { ResultCard } from "../result-card";
import { SliderField } from "../slider-field";

type Offer = {
  amount: number;
  rate: number;
  months: number;
  feePct: number;
};

const OFFER_DEFAULTS: Offer[] = [
  { amount: 2500000, rate: 8.5, months: 240, feePct: 0.5 },
  { amount: 2500000, rate: 9, months: 240, feePct: 0.25 },
  { amount: 2500000, rate: 8.75, months: 180, feePct: 1 },
];

const AMOUNT_MIN = 100000;
const AMOUNT_MAX = 50000000;
const AMOUNT_STEP = 50000;
const RATE_MIN = 5;
const RATE_MAX = 24;
const RATE_STEP = 0.05;
const MONTHS_MIN = 12;
const MONTHS_MAX = 360;
const FEE_MIN = 0;
const FEE_MAX = 3;
const FEE_STEP = 0.05;

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

type Computed = {
  emi: number;
  totalInterest: number;
  fee: number;
  allInCost: number;
};

// Loan comparison: three side-by-side offers, each priced through the pure EMI
// engine, with the lowest all-in cost flagged as best value. Local state, since
// three offers do not deep-link cleanly.
export function LoanComparisonCalculator() {
  const [offers, setOffers] = useState<Offer[]>(OFFER_DEFAULTS);

  function updateOffer(index: number, patch: Partial<Offer>) {
    setOffers((prev) =>
      prev.map((offer, i) => (i === index ? { ...offer, ...patch } : offer)),
    );
  }

  const clamped = useMemo(
    () =>
      offers.map((offer) => ({
        amount: clamp(offer.amount, AMOUNT_MIN, AMOUNT_MAX),
        rate: clamp(offer.rate, RATE_MIN, RATE_MAX),
        months: clamp(offer.months, MONTHS_MIN, MONTHS_MAX),
        feePct: clamp(offer.feePct, FEE_MIN, FEE_MAX),
      })),
    [offers],
  );

  const results = useMemo<Computed[]>(
    () =>
      clamped.map((offer) => {
        // Use the amortization schedule's totals (not EMI x n) so this island's
        // interest agrees to the rupee with the EMI and LAP calculators.
        const schedule = amortizationSchedule({
          principal: offer.amount,
          annualRate: offer.rate,
          months: offer.months,
        });
        const e = schedule.emi;
        const totalInterest = schedule.totalInterest;
        const fee = Math.round((offer.amount * offer.feePct) / 100);
        const allInCost = offer.amount + totalInterest + fee;
        return { emi: e, totalInterest, fee, allInCost };
      }),
    [clamped],
  );

  const bestIndex = useMemo(() => {
    let best = 0;
    for (let i = 1; i < results.length; i++) {
      if (results[i].allInCost < results[best].allInCost) best = i;
    }
    return best;
  }, [results]);

  const rows: { key: keyof Computed; label: string; info: string }[] = [
    { key: "emi", label: "EMI", info: INFO.emi },
    { key: "totalInterest", label: "Total interest", info: INFO.totalInterest },
    { key: "fee", label: "Processing fee", info: INFO.processingFee },
    { key: "allInCost", label: "Total cost", info: INFO.compareTotalCost },
  ];

  return (
    <div className="grid gap-8">
      {/* Offer inputs */}
      <div className="grid gap-6 lg:grid-cols-3">
        {clamped.map((offer, index) => {
          const isBest = index === bestIndex;
          return (
            <div
              key={index}
              className="grid content-start gap-6 rounded-xl border border-[var(--nav-border)] bg-white p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-heading text-lg font-semibold text-[var(--nav-text)]">
                  Offer {index + 1}
                </h3>
                {isBest ? (
                  <span className="rounded-full bg-[var(--nav-primary)] px-2.5 py-1 text-xs font-semibold text-white">
                    Best value
                  </span>
                ) : null}
              </div>

              <SliderField
                id={`loan-amount-${index}`}
                label="Loan amount"
                info={INFO.loanAmount}
                prefix="₹"
                value={offer.amount}
                min={AMOUNT_MIN}
                max={AMOUNT_MAX}
                step={AMOUNT_STEP}
                onChange={(v) => updateOffer(index, { amount: Math.round(v) })}
                helper={formatINR(offer.amount)}
              />
              <SliderField
                id={`loan-rate-${index}`}
                label="Interest rate"
                info={INFO.interestRate}
                suffix="% p.a."
                value={offer.rate}
                min={RATE_MIN}
                max={RATE_MAX}
                step={RATE_STEP}
                onChange={(v) => updateOffer(index, { rate: v })}
                helper={`${offer.rate.toFixed(2)}% per year`}
              />
              <SliderField
                id={`loan-months-${index}`}
                label="Tenure"
                info={INFO.tenure}
                suffix="months"
                value={offer.months}
                min={MONTHS_MIN}
                max={MONTHS_MAX}
                step={1}
                onChange={(v) => updateOffer(index, { months: Math.round(v) })}
                helper={tenureHelper(offer.months)}
              />
              <SliderField
                id={`loan-fee-${index}`}
                label="Processing fee"
                info={INFO.processingFee}
                suffix="%"
                value={offer.feePct}
                min={FEE_MIN}
                max={FEE_MAX}
                step={FEE_STEP}
                onChange={(v) => updateOffer(index, { feePct: v })}
                helper={`${offer.feePct.toFixed(2)}% of loan amount`}
              />
            </div>
          );
        })}
      </div>

      {/* Best value summary */}
      <ResultCard
        emphasis
        label={`Best value: Offer ${bestIndex + 1}`}
        info={INFO.compareTotalCost}
        value={formatINR(results[bestIndex].allInCost)}
        sub="Lowest total cost across all three offers"
      />

      {/* Comparison table */}
      <div className="overflow-x-auto rounded-xl border border-[var(--nav-border)] bg-white">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--nav-border)]">
              <th className="px-4 py-3 text-left font-medium text-text-secondary">
                Metric
              </th>
              {clamped.map((_, index) => (
                <th
                  key={index}
                  className="px-4 py-3 text-right font-semibold text-[var(--nav-text)]"
                >
                  <span className="inline-flex items-center gap-2">
                    Offer {index + 1}
                    {index === bestIndex ? (
                      <span className="rounded-full bg-[var(--nav-primary)] px-2 py-0.5 text-xs font-semibold text-white">
                        Best
                      </span>
                    ) : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className="border-b border-[var(--nav-border)] last:border-b-0"
              >
                <td className="px-4 py-3 text-left text-text-secondary">
                  <span className="inline-flex items-center gap-1.5">
                    {row.label}
                    <InfoHint label={row.label} text={row.info} />
                  </span>
                </td>
                {results.map((result, index) => {
                  const isBestCell = index === bestIndex && row.key === "allInCost";
                  return (
                    <td
                      key={index}
                      className={
                        isBestCell
                          ? "bg-[var(--nav-primary)] px-4 py-3 text-right font-semibold text-white"
                          : "px-4 py-3 text-right font-medium text-[var(--nav-text)]"
                      }
                    >
                      {formatINR(result[row.key])}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
