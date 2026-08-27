"use client";

import * as React from "react";

import {
  listAdminVehicleArrangements,
  updateAdminVehicleArrangement,
  type VehicleArrangement,
  type VehicleArrangementStatus,
} from "@/lib/admin-api";
import type { ApiResponse } from "@/lib/api/client";

// Mirrors features/admin/use-agent-queue.ts's fetch/reload shape. This was the
// one admin queue whose fetching lived inline in its view, which is also why it
// was the one queue whose rows were not clickable — there was no seam to hang a
// detail fetch on.
export function useAdminVehicleArrangements(status?: VehicleArrangementStatus) {
  const [items, setItems] = React.useState<VehicleArrangement[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listAdminVehicleArrangements(status);
    if (res.ok) setItems(res.data);
    else setError(res.error);
    setLoading(false);
  }, [status]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function updateArrangement(
    id: string,
    payload: Parameters<typeof updateAdminVehicleArrangement>[1],
  ): Promise<ApiResponse<unknown>> {
    const res = await updateAdminVehicleArrangement(id, payload);
    if (res.ok) void load();
    return res;
  }

  return { items, loading, error, reload: load, updateArrangement };
}
