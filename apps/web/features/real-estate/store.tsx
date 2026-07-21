"use client";

import * as React from "react";

import type { REListing } from "@/lib/real-estate";

// Frontend-only persistence for the real-estate client workspace: bookmarks,
// compare, enquiries, and site visits all live in localStorage since no
// property or bookmark backend exists yet (see docs/ai/plans for the scope
// decision). Cross-tab sync via the `storage` event keeps two open tabs
// consistent; SSR-safe (reads localStorage only after mount).

function useLocalStorageState<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = React.useState<T>(initial);
  // Real state, not a ref: the hydration effect's setState(parsed) and
  // setHydrated(true) batch into the same render, so the persist effect below
  // never observes hydrated=true alongside the pre-hydration `state` closure.
  // A ref-based flag would flip synchronously inside the hydration effect
  // while the persist effect (running right after, in the same pass) still
  // closed over the initial state, immediately overwriting the just-read
  // value with the default and losing it before the hydrated state applied.
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(key);
    if (raw) {
      try {
        setState(JSON.parse(raw) as T);
      } catch {
        // Corrupt value; fall back to the initial state.
      }
    }
    setHydrated(true);
  }, [key]);

  React.useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    window.localStorage.setItem(key, JSON.stringify(state));
  }, [key, state, hydrated]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    function onStorage(e: StorageEvent) {
      if (e.key !== key || e.newValue === null) return;
      try {
        setState(JSON.parse(e.newValue) as T);
      } catch {
        // Ignore malformed cross-tab writes.
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  return [state, setState];
}

// ---- Bookmarks ----

type BookmarksContextValue = {
  ids: string[];
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  count: number;
};

const BookmarksContext = React.createContext<BookmarksContextValue | null>(null);

function BookmarksProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useLocalStorageState<string[]>("dashboard:re:bookmarks", []);

  const value = React.useMemo<BookmarksContextValue>(
    () => ({
      ids,
      has: (id) => ids.includes(id),
      toggle: (id) =>
        setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
      count: ids.length,
    }),
    [ids, setIds],
  );

  return <BookmarksContext.Provider value={value}>{children}</BookmarksContext.Provider>;
}

export function useBookmarks(): BookmarksContextValue {
  const ctx = React.useContext(BookmarksContext);
  if (!ctx) throw new Error("useBookmarks must be used within RealEstateProvider");
  return ctx;
}

// ---- Compare (max 3) ----

const COMPARE_LIMIT = 3;

type CompareContextValue = {
  ids: string[];
  has: (id: string) => boolean;
  add: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
  isFull: boolean;
};

const CompareContext = React.createContext<CompareContextValue | null>(null);

function CompareProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useLocalStorageState<string[]>("dashboard:re:compare", []);

  const value = React.useMemo<CompareContextValue>(
    () => ({
      ids,
      has: (id) => ids.includes(id),
      add: (id) =>
        setIds((prev) => (prev.includes(id) || prev.length >= COMPARE_LIMIT ? prev : [...prev, id])),
      remove: (id) => setIds((prev) => prev.filter((x) => x !== id)),
      clear: () => setIds([]),
      isFull: ids.length >= COMPARE_LIMIT,
    }),
    [ids, setIds],
  );

  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

export function useCompare(): CompareContextValue {
  const ctx = React.useContext(CompareContext);
  if (!ctx) throw new Error("useCompare must be used within RealEstateProvider");
  return ctx;
}

// ---- Enquiries ----

export type EnquiryStatus = "new" | "contacted" | "closed";

export type Enquiry = {
  id: string;
  listingId: string;
  title: string;
  location: string;
  status: EnquiryStatus;
  createdAt: string;
};

const SEED_ENQUIRIES: Enquiry[] = [
  {
    id: "seed-e1",
    listingId: "a3",
    title: "3 BHK Apartment",
    location: "Gachibowli, Hyderabad",
    status: "contacted",
    createdAt: "2026-07-10",
  },
];

type EnquiriesContextValue = {
  items: Enquiry[];
  add: (listing: REListing) => void;
  updateStatus: (id: string, status: EnquiryStatus) => void;
};

const EnquiriesContext = React.createContext<EnquiriesContextValue | null>(null);

function EnquiriesProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useLocalStorageState<Enquiry[]>("dashboard:re:enquiries", SEED_ENQUIRIES);

  const value = React.useMemo<EnquiriesContextValue>(
    () => ({
      items,
      add: (listing) =>
        setItems((prev) => {
          if (prev.some((e) => e.listingId === listing.id && e.status !== "closed")) return prev;
          const next: Enquiry = {
            id: `e-${listing.id}-${prev.length}`,
            listingId: listing.id,
            title: listing.title,
            location: listing.location,
            status: "new",
            createdAt: new Date().toISOString().slice(0, 10),
          };
          return [next, ...prev];
        }),
      updateStatus: (id, status) =>
        setItems((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e))),
    }),
    [items, setItems],
  );

  return <EnquiriesContext.Provider value={value}>{children}</EnquiriesContext.Provider>;
}

export function useEnquiries(): EnquiriesContextValue {
  const ctx = React.useContext(EnquiriesContext);
  if (!ctx) throw new Error("useEnquiries must be used within RealEstateProvider");
  return ctx;
}

// ---- Site visits ----

export type VisitStatus = "requested" | "confirmed" | "done";

export type SiteVisit = {
  id: string;
  listingId: string;
  title: string;
  location: string;
  date: string;
  status: VisitStatus;
};

const SEED_VISITS: SiteVisit[] = [
  {
    id: "seed-v1",
    listingId: "v1",
    title: "3 BHK Villa",
    location: "Whitefield, Bengaluru",
    date: "2026-07-26",
    status: "confirmed",
  },
];

type SiteVisitsContextValue = {
  items: SiteVisit[];
  add: (listing: REListing, date: string) => void;
  updateStatus: (id: string, status: VisitStatus) => void;
};

const SiteVisitsContext = React.createContext<SiteVisitsContextValue | null>(null);

function SiteVisitsProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useLocalStorageState<SiteVisit[]>("dashboard:re:site-visits", SEED_VISITS);

  const value = React.useMemo<SiteVisitsContextValue>(
    () => ({
      items,
      add: (listing, date) =>
        setItems((prev) => [
          {
            id: `v-${listing.id}-${prev.length}`,
            listingId: listing.id,
            title: listing.title,
            location: listing.location,
            date,
            status: "requested",
          },
          ...prev,
        ]),
      updateStatus: (id, status) =>
        setItems((prev) => prev.map((v) => (v.id === id ? { ...v, status } : v))),
    }),
    [items, setItems],
  );

  return <SiteVisitsContext.Provider value={value}>{children}</SiteVisitsContext.Provider>;
}

export function useSiteVisits(): SiteVisitsContextValue {
  const ctx = React.useContext(SiteVisitsContext);
  if (!ctx) throw new Error("useSiteVisits must be used within RealEstateProvider");
  return ctx;
}

// Single mount point for the app shell: wraps bookmarks, compare, enquiries,
// and site visits so every dashboard page shares one instance of each.
export function RealEstateProvider({ children }: { children: React.ReactNode }) {
  return (
    <BookmarksProvider>
      <CompareProvider>
        <EnquiriesProvider>
          <SiteVisitsProvider>{children}</SiteVisitsProvider>
        </EnquiriesProvider>
      </CompareProvider>
    </BookmarksProvider>
  );
}
