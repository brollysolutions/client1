"use client";

import * as React from "react";

import { listPendingAgentApplications, type AgentApplication } from "@/lib/admin-api";

// Fetches the pending agent-application queue. Mirrors
// features/real-estate/use-submission-queue.ts.
export function useAgentQueue() {
  const [items, setItems] = React.useState<AgentApplication[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listPendingAgentApplications();
    if (res.ok) setItems(res.data);
    else setError(res.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { items, loading, error, reload: load };
}
