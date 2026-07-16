"use client";

import { useMemo } from "react";
import { parseAsInteger, useQueryStates } from "nuqs";

import { INFO } from "@/lib/calculators/glossary";
import { INSURANCE_DISCLAIMER, TERM_COVER_DEFAULTS as D } from "@/lib/calculators/rates";
import { termCover } from "@/lib/finance";
import { formatCompactINR, formatINR } from "@/lib/format";
import { InfoHint } from "../info-hint";
import { RateDisclaimer } from "../rate-disclaimer";
import { ResultCard } from "../result-card";
import { SliderField } from "../slider-field";

function clamp(value: number, min: number, _max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, value); // `max` is a soft slider ceiling, not a hard cap
}

function MethodCard({
  title,
  value,
  info,
  note,
}: {
  title: string;
  value: number;
  info: string;
  note: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--nav-border)] bg-white p-5">
      <div className="flex items-center gap-1.5">
        <p className="font-heading text-base font-semibold text-[var(--nav-text)]">{title}</p>
        <InfoHint label={title} text={info} />
      </div>
      <p className="mt-3 whitespace-nowrap font-heading text-xl font-semibold tabular-nums text-[var(--nav-text)]">
        {formatCompactINR(value)}
      </p>
      <p className="mt-2 text-sm text-text-secondary">{note}</p>
    </div>
  );
}

// Term insurance cover: how much life cover the household needs, by the two
// standard methods insurers use, taking the larger answer and rounding up to
// the next 25 lakh slab.
export function TermInsuranceCalculator() {
  const [state, setState] = useQueryStates(
    {
      age: parseAsInteger.withDefault(D.age),
      income: parseAsInteger.withDefault(D.income),
      expenses: parseAsInteger.withDefault(D.expenses),
      loans: parseAsInteger.withDefault(D.loans),
      cover: parseAsInteger.withDefault(D.cover),
      assets: parseAsInteger.withDefault(D.assets),
    },
    { history: "replace", clearOnDefault: true },
  );

  const age = clamp(state.age, D.ageMin, D.ageMax);
  const income = clamp(state.income, D.incomeMin, D.incomeMax);
  const expenses = clamp(state.expenses, D.expensesMin, D.expensesMax);
  const loans = clamp(state.loans, D.loansMin, D.loansMax);
  const cover = clamp(state.cover, D.coverMin, D.coverMax);
  const assets = clamp(state.assets, D.assetsMin, D.assetsMax);

  const result = useMemo(
    () =>
      termCover({
        age,
        annualIncome: income,
        monthlyExpenses: expenses,
        outstandingLoans: loans,
        existingCover: cover,
        liquidAssets: assets,
      }),
    [age, income, expenses, loans, cover, assets],
  );

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Inputs */}
      <div className="grid content-start gap-6">
        <SliderField
          id="term-age"
          label="Your age"
          info={INFO.termAge}
          suffix="years"
          value={age}
          min={D.ageMin}
          max={D.ageMax}
          step={1}
          onChange={(v) => setState({ age: Math.round(v) })}
          helper={`${result.multiplierUsed}x income multiplier at this age`}
        />
        <SliderField
          id="term-income"
          label="Annual income"
          info={INFO.annualIncome}
          prefix="₹"
          value={income}
          min={D.incomeMin}
          max={D.incomeMax}
          step={D.incomeStep}
          onChange={(v) => setState({ income: Math.round(v) })}
          helper={formatINR(income)}
        />
        <SliderField
          id="term-expenses"
          label="Monthly household expenses"
          info={INFO.monthlyHouseholdExpenses}
          prefix="₹"
          value={expenses}
          min={D.expensesMin}
          max={D.expensesMax}
          step={D.expensesStep}
          onChange={(v) => setState({ expenses: Math.round(v) })}
          helper={formatINR(expenses)}
        />
        <SliderField
          id="term-loans"
          label="Outstanding loans"
          info={INFO.outstandingLoans}
          prefix="₹"
          value={loans}
          min={D.loansMin}
          max={D.loansMax}
          step={D.loansStep}
          onChange={(v) => setState({ loans: Math.round(v) })}
          helper={formatINR(loans)}
        />
        <SliderField
          id="term-cover"
          label="Existing life cover"
          info={INFO.existingCover}
          prefix="₹"
          value={cover}
          min={D.coverMin}
          max={D.coverMax}
          step={D.coverStep}
          onChange={(v) => setState({ cover: Math.round(v) })}
          helper={formatINR(cover)}
        />
        <SliderField
          id="term-assets"
          label="Liquid savings"
          info={INFO.liquidAssets}
          prefix="₹"
          value={assets}
          min={D.assetsMin}
          max={D.assetsMax}
          step={D.assetsStep}
          onChange={(v) => setState({ assets: Math.round(v) })}
          helper={formatINR(assets)}
        />
        <RateDisclaimer text={INSURANCE_DISCLAIMER} />
      </div>

      {/* Results */}
      <div className="grid content-start gap-6">
        {result.adequatelyCovered ? (
          <div className="rounded-xl border border-[var(--nav-border)] bg-white p-5">
            <p className="font-heading text-base font-semibold text-[var(--nav-text)]">
              You look adequately covered
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              Your existing cover and liquid savings already exceed what both methods suggest for
              your income, expenses, and loans. Revisit after a big life change: a home loan, a
              child, or a jump in income.
            </p>
          </div>
        ) : (
          <>
            <ResultCard
              emphasis
              label="Recommended cover"
              info={INFO.recommendedCover}
              value={formatCompactINR(result.recommended)}
              sub="Rounded up to the next 25 lakh slab"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <MethodCard
                title="Income method"
                value={result.incomeMethod}
                info={INFO.incomeMethodCover}
                note={`${result.multiplierUsed}x your annual income, plus loans, minus what you already have.`}
              />
              <MethodCard
                title="Expense method"
                value={result.expenseMethod}
                info={INFO.expenseMethodCover}
                note={`Runs the household to age 60, ${result.yearsTo60} more years, plus loans, minus what you already have.`}
              />
            </div>
            <p className="text-sm text-text-secondary">
              The recommendation takes the larger method. Insurers also cap issuable cover by
              income multiples in underwriting, so very high figures may need documents or get
              trimmed.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
