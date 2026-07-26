"use client";

import * as React from "react";

import {
  listAdminAssignedLeads,
  listAdminEmployees,
  type AdminAssignedLead,
  type AdminEmployee,
} from "@/lib/admin-api";

// Fetches the assigned/working-lead list plus the active-telecaller list (for
// the release/reassign dialog's picker) in parallel. Mirrors
// use-admin-leads.ts's fetch/reload triad.
export function useAdminAssignedLeads() {
  const [leads, setLeads] = React.useState<AdminAssignedLead[]>([]);
  const [telecallers, setTelecallers] = React.useState<AdminEmployee[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const [leadsRes, telecallersRes] = await Promise.all([
      listAdminAssignedLeads(),
      listAdminEmployees(undefined, "telecaller"),
    ]);
    if (leadsRes.ok) setLeads(leadsRes.data);
    else setError(leadsRes.error);
    if (telecallersRes.ok) setTelecallers(telecallersRes.data);
    else if (leadsRes.ok) setError(telecallersRes.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { leads, telecallers, loading, error, reload: load };
}
