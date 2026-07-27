// Admin referral-payout client: the oversight list + execution endpoint
// (PR 2). Thin typed wrapper over /api/v1/referrals via lib/api/client.ts,
// same pattern as lib/payouts-api.ts and lib/admin-api.ts. Wire shape
// (snake_case, generated) is surfaced as-is.

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];
export type AdminReferral = Schemas["AdminReferralRead"];
export type ReferralPayoutRequest = Schemas["ReferralPayoutRequest"];

// Same reasoning as PAYOUT_PAGE_LIMIT in lib/payouts-api.ts — requested
// explicitly so a filter switch and the initial load always agree on how
// much can be truncated.
export const REFERRAL_PAYOUT_PAGE_LIMIT = 100;

export async function listAdminReferrals(
  statusFilter?: string,
): Promise<ApiResponse<AdminReferral[]>> {
  const params = new URLSearchParams({ limit: String(REFERRAL_PAYOUT_PAGE_LIMIT) });
  if (statusFilter) params.set("status_filter", statusFilter);
  const res = await apiRequest<Schemas["AdminReferralListResponse"]>(
    `/api/v1/referrals/admin?${params}`,
  );
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.referrals };
}

export async function createReferralPayout(
  referralId: string,
  body: ReferralPayoutRequest,
): Promise<ApiResponse<Schemas["ReferralPayoutResponse"]>> {
  return apiRequest<Schemas["ReferralPayoutResponse"]>(
    `/api/v1/referrals/${referralId}/payout`,
    { method: "POST", body },
  );
}
