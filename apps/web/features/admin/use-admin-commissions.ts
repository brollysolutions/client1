"use client";

import * as React from "react";

import {
  cancelCommission,
  createCommission,
  listAdminCommissions,
  listEligibleDeals,
  type CommissionCreate,
  type CommissionRead,
  type EligibleDeal,
} from "@/lib/admin-commissions-api";
import type { ApiResponse } from "@/lib/api/client";

// Two independent lists sharing one reload cycle: the eligible-deal queue
// (what CAN be entered) and the oversight list (what HAS been entered).
// Mirrors features/admin/use-admin-loans.ts's fetch/reload shape.
export function useAdminCommissions() {
  const [eligible, setEligible] = React.useState<EligibleDeal[]>([]);
  const [commissions, setCommissions] = React.useState<CommissionRead[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<string>("pending");

  const load = React.useCallback(async (filter: string) => {
    setLoading(true);
    setError(null);
    const [eligibleRes, commissionsRes] = await Promise.all([
      listEligibleDeals(),
      listAdminCommissions(filter || undefined),
    ]);
    if (eligibleRes.ok) setEligible(eligibleRes.data);
    if (commissionsRes.ok) setCommissions(commissionsRes.data);
    if (!eligibleRes.ok) setError(eligibleRes.error);
    else if (!commissionsRes.ok) setError(commissionsRes.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load(statusFilter);
  }, [load, statusFilter]);

  async function enterCommission(body: CommissionCreate): Promise<ApiResponse<CommissionRead>> {
    const res = await createCommission(body);
    if (res.ok) void load(statusFilter);
    return res;
  }

  async function cancel(commissionId: string, reason: string): Promise<ApiResponse<undefined>> {
    const res = await cancelCommission(commissionId, reason);
    if (res.ok) void load(statusFilter);
    return res;
  }

  return {
    eligible,
    commissions,
    loading,
    error,
    statusFilter,
    setStatusFilter,
    reload: () => load(statusFilter),
    enterCommission,
    cancel,
  };
}
