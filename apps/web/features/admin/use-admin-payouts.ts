"use client";

import * as React from "react";

import type { ApiResponse } from "@/lib/api/client";
import {
  approvePayout,
  createPayout,
  listPayouts,
  PAYOUT_PAGE_LIMIT,
  rejectPayout,
  type Payout,
  type PayoutCreate,
} from "@/lib/payouts-api";

// Mirrors use-admin-home.ts's status/errorStatus/retry contract, plus the
// statusFilter + mutation-passthrough shape from use-admin-loans.ts. Defaults
// to the pending queue, since that is the console's actual job.
export function useAdminPayouts() {
  const [payouts, setPayouts] = React.useState<Payout[]>([]);
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [errorStatus, setErrorStatus] = React.useState<number | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<string>("pending_approval");
  const [reloadKey, setReloadKey] = React.useState(0);

  const retry = React.useCallback(() => {
    setStatus("loading");
    setError(null);
    setErrorStatus(null);
    setReloadKey((k) => k + 1);
  }, []);

  React.useEffect(() => {
    let active = true;
    setStatus("loading");
    const run = async () => {
      const res = await listPayouts(statusFilter || undefined);
      if (!active) return;
      if (!res.ok) {
        setError(res.error);
        setErrorStatus(res.status);
        setStatus("error");
        return;
      }
      setPayouts(res.data);
      setStatus("ready");
    };
    void run();
    return () => {
      active = false;
    };
  }, [statusFilter, reloadKey]);

  const reload = React.useCallback(() => setReloadKey((k) => k + 1), []);

  async function approve(id: string): Promise<ApiResponse<Payout>> {
    const res = await approvePayout(id);
    if (res.ok) reload();
    return res;
  }

  async function reject(id: string, reason: string): Promise<ApiResponse<Payout>> {
    const res = await rejectPayout(id, reason);
    if (res.ok) reload();
    return res;
  }

  async function create(body: PayoutCreate): Promise<ApiResponse<Payout>> {
    const res = await createPayout(body);
    if (res.ok) reload();
    return res;
  }

  return {
    payouts,
    status,
    error,
    errorStatus,
    statusFilter,
    setStatusFilter,
    retry,
    approve,
    reject,
    create,
    truncated: payouts.length === PAYOUT_PAGE_LIMIT,
  };
}
