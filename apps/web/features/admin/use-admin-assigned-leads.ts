"use client";

import * as React from "react";

import {
  listAdminAssignedLeads,
  type AdminAssignedLead,
} from "@/lib/admin-api";

// Fetches the read-only assigned/working-lead relationship list.
export function useAdminAssignedLeads() {
  const [leads, setLeads] = React.useState<AdminAssignedLead[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const leadsRes = await listAdminAssignedLeads();
    if (leadsRes.ok) setLeads(leadsRes.data);
    else setError(leadsRes.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { leads, loading, error, reload: load };
}
