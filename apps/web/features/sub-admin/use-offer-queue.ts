"use client";

import * as React from "react";

import { listOffers, type Offer } from "@/lib/offers-api";

// Fetches every offer (shared queue: sub_admin and admin both see all
// statuses, not just active). Exposes the async triad + a refetch used after
// create/edit/schedule/activate/archive so the list stays in sync.
export function useOfferQueue() {
  const [items, setItems] = React.useState<Offer[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listOffers();
    if (res.ok) setItems(res.data);
    else setError(res.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { items, loading, error, reload: load };
}
