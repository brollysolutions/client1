"use client";

import * as React from "react";

import { listAdminLeads, type AdminLead } from "@/lib/admin-api";

// Fetches the read-only queue of leads awaiting automatic Telecaller capacity.
export function useAdminLeadsQueue() {
  const [leads, setLeads] = React.useState<AdminLead[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const leadsRes = await listAdminLeads();
    if (leadsRes.ok) setLeads(leadsRes.data);
    else setError(leadsRes.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { leads, loading, error, reload: load };
}
