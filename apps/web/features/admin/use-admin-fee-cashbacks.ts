"use client";

import * as React from "react";

import {
  cancelFeeCashback,
  createFeeCashback,
  createFeeCashbackPayout,
  listAdminFeeCashbacks,
  listEligibleFeeApplications,
  type EligibleFeeApplication,
  type FeeCashbackCreate,
  type FeeCashbackPayoutRequest,
  type FeeCashbackRead,
} from "@/lib/admin-fee-cashbacks-api";
import type { ApiResponse } from "@/lib/api/client";

// Two independent lists sharing one reload cycle: the eligible-application
// queue (what CAN be entered) and the oversight list (what HAS been
// entered). Mirrors features/admin/use-admin-commissions.ts's shape.
export function useAdminFeeCashbacks() {
  const [eligible, setEligible] = React.useState<EligibleFeeApplication[]>([]);
  const [cashbacks, setCashbacks] = React.useState<FeeCashbackRead[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<string>("pending");

  const load = React.useCallback(async (filter: string) => {
    setLoading(true);
    setError(null);
    const [eligibleRes, cashbacksRes] = await Promise.all([
      listEligibleFeeApplications(),
      listAdminFeeCashbacks(filter || undefined),
    ]);
    if (eligibleRes.ok) setEligible(eligibleRes.data);
    if (cashbacksRes.ok) setCashbacks(cashbacksRes.data);
    if (!eligibleRes.ok) setError(eligibleRes.error);
    else if (!cashbacksRes.ok) setError(cashbacksRes.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load(statusFilter);
  }, [load, statusFilter]);

  async function enterFeeCashback(
    body: FeeCashbackCreate,
  ): Promise<ApiResponse<FeeCashbackRead>> {
    const res = await createFeeCashback(body);
    if (res.ok) void load(statusFilter);
    return res;
  }

  async function cancel(cashbackId: string, reason: string): Promise<ApiResponse<undefined>> {
    const res = await cancelFeeCashback(cashbackId, reason);
    if (res.ok) void load(statusFilter);
    return res;
  }

  async function payFeeCashback(
    cashbackId: string,
    body: FeeCashbackPayoutRequest,
  ): Promise<ApiResponse<unknown>> {
    const res = await createFeeCashbackPayout(cashbackId, body);
    if (res.ok) void load(statusFilter);
    return res;
  }

  return {
    eligible,
    cashbacks,
    loading,
    error,
    statusFilter,
    setStatusFilter,
    reload: () => load(statusFilter),
    enterFeeCashback,
    cancel,
    payFeeCashback,
  };
}
