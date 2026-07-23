"use client";

import * as React from "react";

import { listTelecallerLeads, type TelecallerLead } from "@/lib/telecaller-api";

// Fetches the telecaller's assigned-lead list. Mirrors
// features/admin/use-agent-queue.ts.
export function useTelecallerLeads() {
  const [items, setItems] = React.useState<TelecallerLead[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listTelecallerLeads();
    if (res.ok) setItems(res.data);
    else setError(res.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { items, loading, error, reload: load };
}
