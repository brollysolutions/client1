"use client";

import * as React from "react";

import { useLine } from "@/features/dashboard/line-provider";
import { listTelecallerLeads, type TelecallerLead } from "@/lib/telecaller-api";

// Fetches the telecaller's assigned-lead list. Mirrors
// features/admin/use-agent-queue.ts.
export function useTelecallerLeads() {
  const { activeLine } = useLine();
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
    // Re-fetch when a dual-line telecaller flips their active line — the
    // server scopes this endpoint to whichever line the X-Business-Line
    // header selects, so a stale list would otherwise linger on screen.
    void load();
  }, [load, activeLine]);

  return { items, loading, error, reload: load };
}
