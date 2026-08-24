"use client";

import { Scale } from "lucide-react";
import { toast } from "sonner";

import { useLoanCompare } from "@/features/loans/loan-offers-store";
import type { ProductCategory } from "@/lib/financial-catalog";

// Rendered inside each Explore lender-offer card (features/loans/provider-
// offer-list.tsx). ProviderOfferList is shared across all three Explore
// categories (loans, credit cards, insurance) via the same [slug]/
// [productSlug] route, but Compare Loan Offers is loans-only -- render
// nothing for a non-loan product rather than letting an insurance or
// credit-card offer leak into it. Checkbox + copy mirror the real-estate
// precedent (features/real-estate/property-card.tsx's "Add to compare" row).
export function AddToCompareButton({
  offerId,
  productSlug,
  productCategory,
}: {
  offerId: string;
  productSlug: string;
  productCategory: ProductCategory;
}) {
  const compare = useLoanCompare();

  if (productCategory !== "loan") return null;

  const checked = compare.has(offerId);

  function toggle() {
    if (checked) {
      compare.remove(offerId);
      return;
    }
    if (compare.isFull) {
      toast.info("Compare list is full", { description: "Remove an offer before adding another." });
      return;
    }
    compare.add({ offerId, productSlug });
  }

  return (
    <label className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-1 text-xs text-text-secondary">
      <input
        type="checkbox"
        checked={checked}
        onChange={toggle}
        className="h-3.5 w-3.5 cursor-pointer rounded border-border text-brand-cta focus-visible:outline-none"
      />
      <Scale className="h-3.5 w-3.5" aria-hidden="true" />
      Add to compare
    </label>
  );
}
