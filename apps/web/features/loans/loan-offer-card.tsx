"use client";

import { Landmark } from "lucide-react";
import { toast } from "sonner";

import { useLoanCompare } from "@/features/loans/loan-offers-store";
import type { Bank } from "@/lib/loans";

export function LoanOfferCard({ bank }: { bank: Bank }) {
  const compare = useLoanCompare();
  const checked = compare.has(bank.id);

  function toggle() {
    if (checked) {
      compare.remove(bank.id);
      return;
    }
    if (compare.isFull) {
      toast.info("Shortlist is full", { description: "Remove a bank before adding another." });
      return;
    }
    compare.add(bank.id);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-loans-soft text-loans-accent">
          <Landmark className="h-4 w-4" aria-hidden="true" />
        </span>
        <p className="min-w-0 flex-1 font-medium text-text-primary">{bank.name}</p>
      </div>
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-text-secondary">
        <input
          type="checkbox"
          checked={checked}
          onChange={toggle}
          className="h-3.5 w-3.5 cursor-pointer rounded border-border text-brand-cta focus-visible:outline-none"
        />
        Add to shortlist
      </label>
    </div>
  );
}
