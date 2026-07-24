"use client";

import * as React from "react";

import {
  listAdminPropertyDeals,
  updateAdminPropertyDealProgress,
  type AdminPropertyDeal,
  type PropertyDealProgressUpdate,
} from "@/lib/admin-api";
import type { ApiResponse } from "@/lib/api/client";

// Fetches the platform-wide property-deals list, optionally status-filtered.
// Mirrors features/admin/use-agent-queue.ts.
export function useAdminPropertyDeals(statusFilter: string | undefined) {
  const [deals, setDeals] = React.useState<AdminPropertyDeal[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listAdminPropertyDeals(statusFilter);
    if (res.ok) setDeals(res.data);
    else setError(res.error);
    setLoading(false);
  }, [statusFilter]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function updateDeal(
    dealId: string,
    payload: PropertyDealProgressUpdate,
  ): Promise<ApiResponse<unknown>> {
    const res = await updateAdminPropertyDealProgress(dealId, payload);
    if (res.ok) void load();
    return res;
  }

  return { deals, loading, error, reload: load, updateDeal };
}
