// Admin fee-cashback client: the eligible-application queue, entry,
// oversight list, cancel, and payout (FR-6.6). Thin typed wrapper over
// /api/v1/admin/fee-cashbacks, same pattern as lib/admin-commissions-api.ts.
// Wire shape (snake_case, generated) is surfaced as-is.

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];
export type EligibleFeeApplication = Schemas["EligibleFeeApplication"];
export type FeeCashbackRead = Schemas["FeeCashbackRead"];
export type FeeCashbackCreate = Schemas["FeeCashbackCreate"];
export type FeeCashbackPayoutRequest = Schemas["FeeCashbackPayoutRequest"];

// Same reasoning as COMMISSION_PAGE_LIMIT — requested explicitly so a filter
// switch and the initial load always agree on how much can be truncated.
export const FEE_CASHBACK_PAGE_LIMIT = 100;

export async function listEligibleFeeApplications(): Promise<
  ApiResponse<EligibleFeeApplication[]>
> {
  const res = await apiRequest<Schemas["EligibleFeeApplicationListResponse"]>(
    `/api/v1/admin/fee-cashbacks/eligible?limit=${FEE_CASHBACK_PAGE_LIMIT}`,
  );
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.applications };
}

export async function listAdminFeeCashbacks(
  statusFilter?: string,
): Promise<ApiResponse<FeeCashbackRead[]>> {
  const params = new URLSearchParams({ limit: String(FEE_CASHBACK_PAGE_LIMIT) });
  if (statusFilter) params.set("status_filter", statusFilter);
  const res = await apiRequest<Schemas["FeeCashbackListResponse"]>(
    `/api/v1/admin/fee-cashbacks?${params}`,
  );
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.cashbacks };
}

export async function createFeeCashback(
  body: FeeCashbackCreate,
): Promise<ApiResponse<FeeCashbackRead>> {
  return apiRequest<FeeCashbackRead>("/api/v1/admin/fee-cashbacks", { method: "POST", body });
}

export async function cancelFeeCashback(
  cashbackId: string,
  reason: string,
): Promise<ApiResponse<undefined>> {
  return apiRequest<undefined>(`/api/v1/admin/fee-cashbacks/${cashbackId}/cancel`, {
    method: "POST",
    body: { reason },
  });
}

export async function createFeeCashbackPayout(
  cashbackId: string,
  body: FeeCashbackPayoutRequest,
): Promise<ApiResponse<Schemas["FeeCashbackPayoutResponse"]>> {
  return apiRequest<Schemas["FeeCashbackPayoutResponse"]>(
    `/api/v1/admin/fee-cashbacks/${cashbackId}/payout`,
    { method: "POST", body },
  );
}
