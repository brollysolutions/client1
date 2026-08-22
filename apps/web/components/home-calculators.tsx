import { ArrowRight } from "lucide-react";
import Link from "next/link";
import React from "react";

import { CalculatorCard } from "@/components/calculators/calculator-card";
import { Button } from "@/components/ui/button";
import { getCalculator } from "@/lib/calculators/registry";
import type { CalculatorDef, CalculatorSlug } from "@/lib/calculators/types";

const HOME_CALCULATOR_SLUGS: CalculatorSlug[] = [
  "emi",
  "loan-eligibility",
  "home-affordability",
  "stamp-duty",
];

const HOME_CALCULATORS = HOME_CALCULATOR_SLUGS.map(getCalculator).filter(
  (calculator): calculator is CalculatorDef => calculator !== undefined,
);

export function HomeCalculators() {
  return (
    <section
      aria-labelledby="home-calculators-heading"
      className="w-full border-t border-[var(--nav-border)] bg-background"
    >
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-3xl">
            <h2
              id="home-calculators-heading"
              className="font-heading text-3xl font-semibold text-[var(--nav-text)] sm:text-4xl"
            >
              Calculate before you decide
            </h2>
            <p className="mt-4 text-lg text-text-secondary">
              Check your EMI, borrowing eligibility, home budget, and stamp duty with calculators
              built for Indian financial decisions.
            </p>
          </div>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/calculators">
              View all calculators
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HOME_CALCULATORS.map((calculator) => (
            <CalculatorCard key={calculator.slug} def={calculator} />
          ))}
        </div>
      </div>
    </section>
  );
}
