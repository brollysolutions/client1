"use client";

import * as React from "react";

import {
  createReferralPayout,
  listAdminReferrals,
  type AdminReferral,
  type ReferralPayoutRequest,
} from "@/lib/admin-referrals-api";
import type { ApiResponse } from "@/lib/api/client";

// Mirrors features/admin/use-admin-loans.ts's filter/reload/mutate shape.
// Defaults to "accrued" — the actionable queue — same split as
// use-admin-payouts.ts defaulting to "pending_approval": the backend itself
// applies no default filter (GET /referrals/admin, mirrors GET /payouts).
export function useReferralPayouts() {
  const [items, setItems] = React.useState<AdminReferral[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<string>("accrued");

  const load = React.useCallback(async (filter: string) => {
    setLoading(true);
    setError(null);
    const res = await listAdminReferrals(filter || undefined);
    if (res.ok) setItems(res.data);
    else setError(res.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load(statusFilter);
  }, [load, statusFilter]);

  async function payBonus(
    referralId: string,
    body: ReferralPayoutRequest,
  ): Promise<ApiResponse<unknown>> {
    const res = await createReferralPayout(referralId, body);
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
    payBonus,
  };
}
