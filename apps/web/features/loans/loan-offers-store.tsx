"use client";

import * as React from "react";

// Frontend-only persistence for the loans Compare Loan Offers page. Same
// hydration pattern as features/real-estate/store.tsx's useLocalStorageState:
// hydrated is real state (not a ref) so the persist effect never observes
// hydrated=true alongside the pre-hydration `state` closure — that combo was
// the stale-closure bug that wiped saved data on every remount during the
// real-estate build.

const COMPARE_LIMIT = 3;
const STORAGE_KEY = "dashboard:loans:compare";

type LoanCompareContextValue = {
  ids: string[];
  has: (id: string) => boolean;
  add: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
  isFull: boolean;
};

const LoanCompareContext = React.createContext<LoanCompareContextValue | null>(null);

export function LoanCompareProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = React.useState<string[]>([]);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        setIds(JSON.parse(raw) as string[]);
      } catch {
        // Corrupt value; fall back to empty.
      }
    }
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  }, [ids, hydrated]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY || e.newValue === null) return;
      try {
        setIds(JSON.parse(e.newValue) as string[]);
      } catch {
        // Ignore malformed cross-tab writes.
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = React.useMemo<LoanCompareContextValue>(
    () => ({
      ids,
      has: (id) => ids.includes(id),
      add: (id) =>
        setIds((prev) => (prev.includes(id) || prev.length >= COMPARE_LIMIT ? prev : [...prev, id])),
      remove: (id) => setIds((prev) => prev.filter((x) => x !== id)),
      clear: () => setIds([]),
      isFull: ids.length >= COMPARE_LIMIT,
    }),
    [ids],
  );

  return <LoanCompareContext.Provider value={value}>{children}</LoanCompareContext.Provider>;
}

export function useLoanCompare(): LoanCompareContextValue {
  const ctx = React.useContext(LoanCompareContext);
  if (!ctx) throw new Error("useLoanCompare must be used within LoanCompareProvider");
  return ctx;
}
