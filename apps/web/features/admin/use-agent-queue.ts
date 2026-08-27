"use client";

import * as React from "react";

import { listAgentApplications, type AgentApplication } from "@/lib/admin-api";

// Fetches the agent-application queue. Mirrors
// features/real-estate/use-submission-queue.ts.
//
// `status` defaults to pending on the server, which is what the console opens
// on; passing another value lets an Admin look back at what they already
// approved or rejected instead of the queue being a one-way door.
export function useAgentQueue(status?: "pending" | "approved" | "rejected" | "all") {
  const [items, setItems] = React.useState<AgentApplication[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listAgentApplications(status);
    if (res.ok) setItems(res.data);
    else setError(res.error);
    setLoading(false);
  }, [status]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { items, loading, error, reload: load };
}
