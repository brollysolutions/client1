"use client";

import * as React from "react";
import { toast } from "sonner";

import { createBookmark, deleteBookmark, getBookmarks } from "@/lib/bookmarks";

// Display snapshot passed by the caller (the property card, which already holds
// the listing) so the bookmark row can denormalize title/locality/city without
// re-resolving the id against a catalog — property ids are real UUIDs now, not
// mock keys, so a catalog lookup by id is neither available nor needed here.
type BookmarkSnapshot = { title: string; locality: string; city: string };

// Frontend-only persistence for the real-estate client workspace: compare
// lives in localStorage since no property backend exists yet. Bookmarks are
// server-backed (lib/bookmarks.ts); enquiries and site visits have likewise
// moved to real APIs (lib/enquiries.ts, lib/site-visits.ts). Cross-tab sync
// via the `storage` event keeps two open compare tabs consistent; SSR-safe
// (reads localStorage only after mount).

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
  toggle: (id: string, snapshot?: BookmarkSnapshot) => void;
  count: number;
  // Initial-load state for the Bookmarks page's own loading/error UI.
  // property-card.tsx (elsewhere in the app) doesn't read these; while
  // "loading", `has()` simply returns false, the same transient window the
  // old localStorage version had before its hydration effect ran.
  status: "loading" | "ready" | "error";
  error: string | null;
  retry: () => void;
};

const BookmarksContext = React.createContext<BookmarksContextValue | null>(null);

// Server-backed (lib/bookmarks.ts). Loads once on mount; toggle is optimistic
// (flips local state immediately, fires the request, rolls back + toasts on
// failure) so every card across Explore/Home renders from this one fetch
// without a per-card round trip.
function BookmarksProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = React.useState<string[]>([]);
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    setStatus("loading");
    setError(null);
    void getBookmarks().then((res) => {
      if (!active) return;
      if (res.ok) {
        setIds(res.data.map((b) => b.propertyRef));
        setStatus("ready");
      } else {
        setError(res.error);
        setStatus("error");
      }
    });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const value = React.useMemo<BookmarksContextValue>(
    () => ({
      ids,
      has: (id) => ids.includes(id),
      toggle: (id, snapshot) => {
        const wasBookmarked = ids.includes(id);
        setIds((prev) => (wasBookmarked ? prev.filter((x) => x !== id) : [...prev, id]));

        if (wasBookmarked) {
          void deleteBookmark(id).then((res) => {
            if (!res.ok) {
              setIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
              toast.error(res.error || "Couldn't remove bookmark. Please try again.");
            }
          });
        } else {
          void createBookmark({
            propertyRef: id,
            ...(snapshot
              ? { title: snapshot.title, locality: snapshot.locality, city: snapshot.city }
              : {}),
          }).then((res) => {
            if (!res.ok) {
              setIds((prev) => prev.filter((x) => x !== id));
              toast.error(res.error || "Couldn't save bookmark. Please try again.");
            }
          });
        }
      },
      count: ids.length,
      status,
      error,
      retry: () => setReloadKey((k) => k + 1),
    }),
    [ids, status, error],
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

// Single mount point for the app shell: wraps bookmarks and compare so every
// dashboard page shares one instance of each. Site visits and enquiries used
// to live here too (localStorage-only); both have been replaced by real APIs
// (lib/site-visits.ts, lib/enquiries.ts), so those slices were removed.
export function RealEstateProvider({ children }: { children: React.ReactNode }) {
  return (
    <BookmarksProvider>
      <CompareProvider>{children}</CompareProvider>
    </BookmarksProvider>
  );
}
