"use client";

import { useMemo } from "react";
import { parseAsFloat, parseAsInteger, useQueryStates } from "nuqs";

import { INFO } from "@/lib/calculators/glossary";
import { CARD_PAYOFF_DEFAULTS as D } from "@/lib/calculators/rates";
import { cardPayoff, type PayoffPath } from "@/lib/finance";
import { formatINR } from "@/lib/format";
import { InfoHint } from "../info-hint";
import { RateDisclaimer } from "../rate-disclaimer";
import { ResultCard } from "../result-card";
import { SliderField } from "../slider-field";

function clamp(value: number, min: number, _max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, value); // `max` is a soft slider ceiling, not a hard cap
}

function monthsHelper(months: number): string {
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0) return `${months} months`;
  return rem ? `${years} yr ${rem} mo` : `${years} years`;
}

function PathCard({ title, path, note }: { title: string; path: PayoffPath; note?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--nav-border)] bg-white p-5">
      <p className="font-heading text-base font-semibold text-[var(--nav-text)]">{title}</p>
      <div className="mt-3 flex items-center gap-1.5">
        <p className="text-sm text-text-secondary">Debt-free in</p>
        <InfoHint label="Debt-free in" text={INFO.payoffMonths} />
      </div>
      <p className="mt-1 whitespace-nowrap font-heading text-xl font-semibold tabular-nums text-[var(--nav-text)]">
        {monthsHelper(path.months)}
      </p>
      <div className="mt-3 flex items-center gap-1.5">
        <p className="text-sm text-text-secondary">Total paid</p>
        <InfoHint label="Total paid" text={INFO.payoffTotalPaid} />
      </div>
      <p className="mt-1 whitespace-nowrap font-heading text-xl font-semibold tabular-nums text-[var(--nav-text)]">
        {formatINR(path.totalPaid)}
      </p>
      <p className="mt-2 text-sm text-text-secondary">
        Interest {formatINR(path.totalInterest)} + GST {formatINR(path.totalGst)}
      </p>
      {note ? <p className="mt-2 text-sm text-text-secondary">{note}</p> : null}
    </div>
  );
}

// Credit card payoff: a fixed monthly payment against the balance versus the
// minimum-due trap, side by side, with the GST every card statement adds on
// interest. State lives in the URL through nuqs so results are shareable.
export function CreditCardPayoffCalculator() {
  const [state, setState] = useQueryStates(
    {
      balance: parseAsInteger.withDefault(D.balance),
      apr: parseAsFloat.withDefault(D.apr),
      payment: parseAsInteger.withDefault(D.payment),
    },
    { history: "replace", clearOnDefault: true },
  );

  const balance = clamp(state.balance, D.balanceMin, D.balanceMax);
  const apr = clamp(state.apr, D.aprMin, D.aprMax);
  const payment = clamp(state.payment, D.paymentMin, D.paymentMax);

  const result = useMemo(
    () => cardPayoff({ balance, annualRate: apr, monthlyPayment: payment }),
    [balance, apr, payment],
  );

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Inputs */}
      <div className="grid content-start gap-6">
        <SliderField
          id="ccp-balance"
          label="Card balance"
          info={INFO.cardBalance}
          prefix="₹"
          value={balance}
          min={D.balanceMin}
          max={D.balanceMax}
          step={D.balanceStep}
          onChange={(v) => setState({ balance: Math.round(v) })}
          helper={formatINR(balance)}
        />
        <SliderField
          id="ccp-apr"
          label="Card interest rate"
          info={INFO.cardApr}
          suffix="% p.a."
          value={apr}
          min={D.aprMin}
          max={D.aprMax}
          step={D.aprStep}
          onChange={(v) => setState({ apr: v })}
          helper={`${apr.toFixed(1)}% a year, about ${(apr / 12).toFixed(2)}% a month`}
        />
        <SliderField
          id="ccp-payment"
          label="Monthly payment"
          info={INFO.monthlyCardPayment}
          prefix="₹"
          value={payment}
          min={D.paymentMin}
          max={D.paymentMax}
          step={D.paymentStep}
          onChange={(v) => setState({ payment: Math.round(v) })}
          helper={formatINR(payment)}
        />
        <RateDisclaimer />
      </div>

      {/* Results */}
      <div className="grid content-start gap-6">
        {result.fixed.neverClears ? (
          <div className="rounded-xl border border-[var(--nav-border)] bg-white p-5">
            <p className="font-heading text-base font-semibold text-[var(--nav-text)]">
              This payment never clears the card
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              {formatINR(payment)} does not even cover one month of interest and GST on this
              balance, so the debt only grows. Raise the monthly payment until a payoff date
              appears.
            </p>
          </div>
        ) : (
          <>
            <ResultCard
              emphasis
              label="Saved vs paying minimum due"
              info={INFO.savedVsMinDue}
              value={formatINR(result.savedVsMinDue)}
              sub={
                result.minDue.neverClears
                  ? "The minimum due never clears this balance at all"
                  : `Debt-free ${monthsHelper(result.minDue.months - result.fixed.months)} sooner`
              }
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <PathCard title={`Paying ${formatINR(payment)} a month`} path={result.fixed} />
              {result.minDue.neverClears ? (
                <div className="min-w-0 rounded-xl border border-[var(--nav-border)] bg-white p-5">
                  <p className="font-heading text-base font-semibold text-[var(--nav-text)]">
                    Paying only the minimum due
                  </p>
                  <p className="mt-2 text-sm text-text-secondary">
                    At this rate the 5% minimum due shrinks slower than interest and GST pile up,
                    so the balance never reaches zero. This is the minimum-due trap in its purest
                    form.
                  </p>
                </div>
              ) : (
                <PathCard
                  title="Paying only the minimum due"
                  path={result.minDue}
                  note="5% of the statement or ₹200, whichever is higher. Issuers vary the exact formula."
                />
              )}
            </div>
            <p className="text-sm text-text-secondary">
              Card interest carries 18% GST on top, which this calculator includes. Even a small
              fixed payment beats the minimum due by years.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
