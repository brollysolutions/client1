"use client";

import * as React from "react";

// Frontend-only persistence for the loans Compare Loan Offers page. Same
// hydration pattern as features/real-estate/store.tsx's useLocalStorageState:
// hydrated is real state (not a ref) so the persist effect never observes
// hydrated=true alongside the pre-hydration `state` closure — that combo was
// the stale-closure bug that wiped saved data on every remount during the
// real-estate build.
//
// Shortlists real published provider offers (added from Explore's offer
// cards), not bank ids -- v1 of this store only kept bank ids because
// /loans/banks carried no rate/tenure/fee data to compare. Only `offerId` +
// `productSlug` are persisted; everything else (provider name, rate, tenure,
// fee, product label) is resolved fresh from the public catalogue on the
// Compare page each load, same "resolve ids against a freshly-fetched
// catalog" philosophy features/real-estate/compare-view.tsx already uses, so
// a relabeled product or an updated offer never shows stale cached copy.

const COMPARE_LIMIT = 3;
// Bumped from "dashboard:loans:compare" (v1 stored bank ids): the shape
// changed from string[] to ShortlistedOffer[], and the hydration guard below
// only protects against malformed JSON, not a structurally different but
// still-valid old array -- a fresh key sidesteps that entirely.
const STORAGE_KEY = "dashboard:loans:compare:v2";

export type ShortlistedOffer = {
  offerId: string;
  productSlug: string;
};

type LoanCompareContextValue = {
  items: ShortlistedOffer[];
  has: (offerId: string) => boolean;
  add: (offer: ShortlistedOffer) => void;
  remove: (offerId: string) => void;
  clear: () => void;
  isFull: boolean;
  // The Compare page fetches each shortlisted offer's product from the
  // network, keyed off `items` -- without this it would run that fetch once
  // against the pre-hydration empty array and render "Nothing to compare
  // yet" for one frame before localStorage's real items land.
  hydrated: boolean;
};

const LoanCompareContext = React.createContext<LoanCompareContextValue | null>(null);

function isShortlistedOfferArray(value: unknown): value is ShortlistedOffer[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).offerId === "string" &&
        typeof (item as Record<string, unknown>).productSlug === "string",
    )
  );
}

export function LoanCompareProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ShortlistedOffer[]>([]);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (isShortlistedOfferArray(parsed)) setItems(parsed);
      } catch {
        // Corrupt value; fall back to empty.
      }
    }
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, hydrated]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY || e.newValue === null) return;
      try {
        const parsed: unknown = JSON.parse(e.newValue);
        if (isShortlistedOfferArray(parsed)) setItems(parsed);
      } catch {
        // Ignore malformed cross-tab writes.
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = React.useMemo<LoanCompareContextValue>(
    () => ({
      items,
      has: (offerId) => items.some((item) => item.offerId === offerId),
      add: (offer) =>
        setItems((prev) =>
          prev.some((item) => item.offerId === offer.offerId) || prev.length >= COMPARE_LIMIT
            ? prev
            : [...prev, offer],
        ),
      remove: (offerId) => setItems((prev) => prev.filter((item) => item.offerId !== offerId)),
      clear: () => setItems([]),
      isFull: items.length >= COMPARE_LIMIT,
      hydrated,
    }),
    [items, hydrated],
  );

  return <LoanCompareContext.Provider value={value}>{children}</LoanCompareContext.Provider>;
}

export function useLoanCompare(): LoanCompareContextValue {
  const ctx = React.useContext(LoanCompareContext);
  if (!ctx) throw new Error("useLoanCompare must be used within LoanCompareProvider");
  return ctx;
}
