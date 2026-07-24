"use client";

import * as React from "react";

import { listAgentLeads, type AgentLead } from "@/lib/agent-api";

export function useAgentLeads() {
  const [items, setItems] = React.useState<AgentLead[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listAgentLeads();
    if (res.ok) setItems(res.data);
    else setError(res.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { items, loading, error, reload: load };
}
