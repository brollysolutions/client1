"use client";

import * as React from "react";

import {
  listAdminLoans,
  updateAdminLoanApplication,
  type AdminLoanApplication,
  type LoanApplicationProgressUpdate,
} from "@/lib/admin-api";
import type { ApiResponse } from "@/lib/api/client";

// Mirrors features/admin/use-agent-queue.ts's fetch/reload shape.
export function useAdminLoans() {
  const [items, setItems] = React.useState<AdminLoanApplication[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<string>("");

  const load = React.useCallback(async (filter: string) => {
    setLoading(true);
    setError(null);
    const res = await listAdminLoans(filter || undefined);
    if (res.ok) setItems(res.data);
    else setError(res.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load(statusFilter);
  }, [load, statusFilter]);

  async function updateApp(
    applicationId: string,
    payload: LoanApplicationProgressUpdate,
  ): Promise<ApiResponse<unknown>> {
    const res = await updateAdminLoanApplication(applicationId, payload);
    if (res.ok) void load(statusFilter);
    return res;
  }

  return {
    items,
    loading,
    error,
    statusFilter,
    setStatusFilter,
    reload: () => load(statusFilter),
    updateApp,
  };
}
