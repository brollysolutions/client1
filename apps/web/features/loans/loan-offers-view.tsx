"use client";

import { Scale } from "lucide-react";

import { LoanOfferCard } from "@/features/loans/loan-offer-card";
import { useLoanCompare } from "@/features/loans/loan-offers-store";
import { LOAN_TYPES, getOfferById, getOffersByType, type LoanOffer } from "@/lib/loan-offers";

const COMPARE_ROWS: { label: string; getValue: (o: LoanOffer) => string }[] = [
  { label: "Bank", getValue: (o) => o.bankName },
  { label: "Interest rate", getValue: (o) => o.interestRate },
  { label: "Max amount", getValue: (o) => o.maxAmount },
  { label: "Max tenure", getValue: (o) => o.maxTenure },
  { label: "Processing fee", getValue: (o) => o.processingFee },
];

// Loans line's Compare Loan Offers: a single self-contained page (no separate
// browse/bookmark step like the real-estate Compare, since loans has no
// catalog home to hang saves off). Comparison table builds live at the top as
// offers are checked below, grouped by loan type.
export function LoanOffersView() {
  const compare = useLoanCompare();
  const selected = compare.ids.map(getOfferById).filter((o): o is LoanOffer => Boolean(o));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Compare Loan Offers</h1>
          <p className="text-sm text-text-secondary">
            Check up to 3 offers below to compare them side by side.
          </p>
        </div>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={compare.clear}
            className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-sm text-text-primary transition-colors hover:border-brand-cta hover:text-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
          >
            Clear all
          </button>
        )}
      </div>

      {selected.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-text-secondary">
            <Scale className="h-5 w-5" />
          </span>
          <p className="mx-auto mt-3 max-w-md text-sm text-text-secondary">
            Check up to 3 offers below to compare them here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="w-32 px-5 py-3 text-xs font-medium uppercase tracking-wide text-text-secondary" />
                {selected.map((offer) => (
                  <th key={offer.id} className="min-w-[180px] px-5 py-3 font-semibold text-text-primary">
                    {offer.bankName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map(({ label, getValue }) => (
                <tr key={label} className="border-b border-border last:border-0">
                  <td className="px-5 py-4 text-xs font-medium uppercase tracking-wide text-text-secondary">
                    {label}
                  </td>
                  {selected.map((offer) => (
                    <td
                      key={offer.id}
                      className={
                        label === "Interest rate"
                          ? "px-5 py-4 font-heading font-semibold text-brand-blue"
                          : "px-5 py-4 text-text-primary"
                      }
                    >
                      {getValue(offer)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-8">
        {LOAN_TYPES.map((type) => (
          <section key={type.key}>
            <h2 className="font-heading text-xl font-semibold text-text-primary">{type.label}</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {getOffersByType(type.key).map((offer) => (
                <LoanOfferCard key={offer.id} offer={offer} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
