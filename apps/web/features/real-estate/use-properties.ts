"use client";

import * as React from "react";

import { getProperties } from "@/lib/properties-api";
import type { REListing } from "@/lib/real-estate";

// Fetches the full active property catalog once on mount. The catalog is small,
// so search/filter/sort all run client-side over this array (usePropertyFilters);
// the token is in-memory, so the fetch must be client-side, not a server
// component. Returns loading/error alongside the listings so consumers can render
// the async triad (the catalog used to be a synchronous import).
export function useProperties() {
  const [listings, setListings] = React.useState<REListing[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getProperties();
    if (res.ok) {
      setListings(res.data);
    } else {
      setError(res.error);
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getProperties();
      if (!alive) return;
      if (res.ok) setListings(res.data);
      else setError(res.error);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  return { listings, loading, error, retry: load };
}
