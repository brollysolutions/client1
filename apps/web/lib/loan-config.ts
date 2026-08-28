// Pure helpers for the per-bank product catalogue. The public presentation
// state deliberately stays separate from the operational availability matrix.
// Absence of an availability entry means available for staff assignment only.

import type { AvailabilityEntry } from "@/lib/loan-config-api";

export type ProviderPresentationState = "live" | "draft" | "operational" | "unavailable";

export type ProviderPresentationStateInput = {
  hasOffer: boolean;
  offerPublished: boolean;
  offerVerified: boolean;
  productActive: boolean;
  productPublic: boolean;
  providerActive: boolean;
  operational: boolean;
};

export function getProviderPresentationState({
  hasOffer,
  offerPublished,
  offerVerified,
  productActive,
  productPublic,
  providerActive,
  operational,
}: ProviderPresentationStateInput): ProviderPresentationState {
  if (
    hasOffer &&
    offerPublished &&
    offerVerified &&
    productActive &&
    productPublic &&
    providerActive
  ) {
    return "live";
  }
  if (hasOffer) return "draft";
  return operational ? "operational" : "unavailable";
}

export function isAvailable(
  entries: AvailabilityEntry[],
  bankId: string,
  loanTypeId: string,
): boolean {
  const entry = entries.find((e) => e.bank_id === bankId && e.loan_type_id === loanTypeId);
  return entry === undefined || entry.available;
}
