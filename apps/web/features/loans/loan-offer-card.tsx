"use client";

import { Landmark } from "lucide-react";
import { toast } from "sonner";

import { useLoanCompare } from "@/features/loans/loan-offers-store";
import type { LoanOffer } from "@/lib/loan-offers";

export function LoanOfferCard({ offer }: { offer: LoanOffer }) {
  const compare = useLoanCompare();
  const checked = compare.has(offer.id);

  function toggle() {
    if (checked) {
      compare.remove(offer.id);
      return;
    }
    if (compare.isFull) {
      toast.info("Compare is full", { description: "Remove an offer before adding another." });
      return;
    }
    compare.add(offer.id);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-loans-soft text-loans-accent">
          <Landmark className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-text-primary">{offer.bankName}</p>
          <p className="mt-1 font-heading text-lg font-semibold text-brand-blue">{offer.interestRate}</p>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-text-secondary">
        <div>
          <dt className="uppercase tracking-wide">Max amount</dt>
          <dd className="mt-0.5 font-medium text-text-primary">{offer.maxAmount}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide">Max tenure</dt>
          <dd className="mt-0.5 font-medium text-text-primary">{offer.maxTenure}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide">Processing fee</dt>
          <dd className="mt-0.5 font-medium text-text-primary">{offer.processingFee}</dd>
        </div>
      </dl>
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-text-secondary">
        <input
          type="checkbox"
          checked={checked}
          onChange={toggle}
          className="h-3.5 w-3.5 cursor-pointer rounded border-border text-brand-cta focus-visible:outline-none"
        />
        Add to compare
      </label>
    </div>
  );
}
