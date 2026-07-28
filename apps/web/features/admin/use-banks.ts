"use client";

import * as React from "react";

import { listAdminBanks, type AdminBank } from "@/lib/loan-config-api";

export function useBanks() {
  const [items, setItems] = React.useState<AdminBank[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listAdminBanks();
    if (res.ok) setItems(res.data);
    else setError(res.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { items, loading, error, reload: load };
}
