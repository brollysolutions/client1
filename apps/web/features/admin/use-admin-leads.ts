"use client";

import * as React from "react";

import {
  listAdminEmployees,
  listAdminLeads,
  type AdminEmployee,
  type AdminLead,
} from "@/lib/admin-api";

// Fetches the unassigned-lead queue plus the active-telecaller list (for the
// assign dialog's picker) in parallel. Mirrors use-admin-tasks.ts's
// fetch/reload triad, swapping employees for telecallers.
export function useAdminLeadsQueue() {
  const [leads, setLeads] = React.useState<AdminLead[]>([]);
  const [telecallers, setTelecallers] = React.useState<AdminEmployee[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const [leadsRes, telecallersRes] = await Promise.all([
      listAdminLeads(),
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
