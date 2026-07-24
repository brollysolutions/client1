"use client";

import * as React from "react";

import { listBanners, type Banner } from "@/lib/banners-api";

// Fetches every banner (shared queue: sub_admin and admin both see all
// statuses, not just pending). Exposes the async triad + a refetch used after
// create/submit/approve/reject so the list stays in sync.
export function useBannerQueue() {
  const [items, setItems] = React.useState<Banner[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listBanners();
    if (res.ok) setItems(res.data);
    else setError(res.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { items, loading, error, reload: load };
}
