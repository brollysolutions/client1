// Admin commission client: the eligible-deal queue, entry, oversight list,
// and cancel (FR-8.1/8.2). Thin typed wrapper over
// /api/v1/admin/commissions, same pattern as lib/admin-referrals-api.ts.
// Wire shape (snake_case, generated) is surfaced as-is.

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];
export type EligibleDeal = Schemas["EligibleDeal"];
export type CommissionRead = Schemas["CommissionRead"];
export type CommissionCreate = Schemas["CommissionCreate"];
export type CommissionPayoutRequest = Schemas["CommissionPayoutRequest"];

// Same reasoning as REFERRAL_PAYOUT_PAGE_LIMIT — requested explicitly so a
// filter switch and the initial load always agree on how much can be truncated.
export const COMMISSION_PAGE_LIMIT = 100;

export async function listEligibleDeals(): Promise<ApiResponse<EligibleDeal[]>> {
  const res = await apiRequest<Schemas["EligibleDealListResponse"]>(
    `/api/v1/admin/commissions/eligible?limit=${COMMISSION_PAGE_LIMIT}`,
  );
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.deals };
}

export async function listAdminCommissions(
  statusFilter?: string,
): Promise<ApiResponse<CommissionRead[]>> {
  const params = new URLSearchParams({ limit: String(COMMISSION_PAGE_LIMIT) });
  if (statusFilter) params.set("status_filter", statusFilter);
  const res = await apiRequest<Schemas["CommissionListResponse"]>(
    `/api/v1/admin/commissions?${params}`,
  );
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.commissions };
}

export async function createCommission(
  body: CommissionCreate,
): Promise<ApiResponse<CommissionRead>> {
  return apiRequest<CommissionRead>("/api/v1/admin/commissions", { method: "POST", body });
}

export async function cancelCommission(
  commissionId: string,
  reason: string,
): Promise<ApiResponse<undefined>> {
  return apiRequest<undefined>(`/api/v1/admin/commissions/${commissionId}/cancel`, {
    method: "POST",
    body: { reason },
  });
}

export async function createCommissionPayout(
  commissionId: string,
  body: CommissionPayoutRequest,
): Promise<ApiResponse<Schemas["CommissionPayoutResponse"]>> {
  return apiRequest<Schemas["CommissionPayoutResponse"]>(
    `/api/v1/admin/commissions/${commissionId}/payout`,
    { method: "POST", body },
  );
}
