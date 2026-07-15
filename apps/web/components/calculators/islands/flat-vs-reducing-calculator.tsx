"use client";

import { useMemo } from "react";
import { parseAsFloat, parseAsInteger, useQueryStates } from "nuqs";

import { INFO } from "@/lib/calculators/glossary";
import { FLAT_RATE_DEFAULTS as D } from "@/lib/calculators/rates";
import { flatToReducing } from "@/lib/finance";
import { formatINR } from "@/lib/format";
import { RateDisclaimer } from "../rate-disclaimer";
import { ResultCard } from "../result-card";
import { SliderField } from "../slider-field";

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

// Flat vs reducing: converts the flat rate quoted on car and personal loans to
// the reducing-balance rate it actually costs, with the two loans side by side.
export function FlatVsReducingCalculator() {
  const [state, setState] = useQueryStates(
    {
      amount: parseAsInteger.withDefault(D.principal),
      flat: parseAsFloat.withDefault(D.flatRate),
      months: parseAsInteger.withDefault(D.months),
    },
    { history: "replace", clearOnDefault: true },
  );

  const amount = clamp(state.amount, D.principalMin, D.principalMax);
  const flat = clamp(state.flat, D.flatRateMin, D.flatRateMax);
  const months = clamp(state.months, D.monthsMin, D.monthsMax);

  const result = useMemo(
    () => flatToReducing({ principal: amount, flatRate: flat, months }),
    [amount, flat, months],
  );

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Inputs */}
      <div className="grid content-start gap-6">
        <SliderField
          id="fvr-amount"
          label="Loan amount"
          info={INFO.loanAmount}
          prefix="₹"
          value={amount}
          min={D.principalMin}
          max={D.principalMax}
          step={D.principalStep}
          allowAboveMax
          onChange={(v) => setState({ amount: Math.round(v) })}
          helper={formatINR(amount)}
        />
        <SliderField
          id="fvr-flat"
          label="Quoted flat rate"
          info={INFO.flatRate}
          suffix="% p.a."
          value={flat}
          min={D.flatRateMin}
          max={D.flatRateMax}
          step={D.flatRateStep}
          onChange={(v) => setState({ flat: v })}
          helper={`${flat.toFixed(1)}% flat per year`}
        />
        <SliderField
          id="fvr-months"
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
        <RateDisclaimer />
      </div>

      {/* Results */}
      <div className="grid content-start gap-6">
        <ResultCard
          emphasis
          label="What the flat quote really costs"
          info={INFO.effectiveReducingRate}
          value={`${result.effectiveReducingRate.toFixed(2)}%`}
          sub={`${flat.toFixed(1)}% flat equals ${result.effectiveReducingRate.toFixed(2)}% reducing`}
        />

        <div className="overflow-x-auto rounded-xl border border-[var(--nav-border)] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--nav-border)] text-left">
                <th className="px-5 py-3 font-medium text-text-secondary"></th>
                <th className="px-5 py-3 font-medium text-text-secondary">
                  Flat {flat.toFixed(1)}%
                </th>
                <th className="px-5 py-3 font-medium text-text-secondary">
                  Reducing {flat.toFixed(1)}%
                </th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <tr className="border-b border-[var(--nav-border)]">
                <td className="px-5 py-3 text-text-secondary">Monthly EMI</td>
                <td className="px-5 py-3 font-semibold text-[var(--nav-text)]">
                  {formatINR(result.flatEmi)}
                </td>
                <td className="px-5 py-3 font-semibold text-[var(--nav-text)]">
                  {formatINR(result.atSameRateReducing.emi)}
                </td>
              </tr>
              <tr className="border-b border-[var(--nav-border)]">
                <td className="px-5 py-3 text-text-secondary">Total interest</td>
                <td className="px-5 py-3 font-semibold text-[var(--nav-text)]">
                  {formatINR(result.totalInterestFlat)}
                </td>
                <td className="px-5 py-3 font-semibold text-[var(--nav-text)]">
                  {formatINR(result.atSameRateReducing.totalInterest)}
                </td>
              </tr>
              <tr>
                <td className="px-5 py-3 text-text-secondary">Extra paid on flat</td>
                <td className="px-5 py-3 font-semibold text-brand-blue" colSpan={2}>
                  {formatINR(result.atSameRateReducing.extraPaidOnFlat)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-sm text-text-secondary">
          A flat rate charges interest on the full amount for the whole tenure, even as you repay
          it. Always ask a dealer or lender for the reducing-balance rate before comparing offers.
        </p>
      </div>
    </div>
  );
}
