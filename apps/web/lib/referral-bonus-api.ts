// Referral bonus config client for the Sub Admin content surface + Admin
// read-only oversight, plus a read-only payout-activity feed.
//
// Thin typed wrapper over /api/v1/referral-bonus-config via lib/api/client.ts.
// No lifecycle-advance calls (unlike offers) — active is a plain
// toggle set through updateReferralBonusConfig.

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];
export type ReferralBonusConfig = Schemas["ReferralBonusConfigRead"];
export type ReferralPayoutActivity = Schemas["ReferralPayoutActivityRead"];

export async function createReferralBonusConfig(
  payload: Schemas["ReferralBonusConfigCreate"],
): Promise<ApiResponse<ReferralBonusConfig>> {
  return apiRequest<ReferralBonusConfig>(`/api/v1/referral-bonus-config`, {
    method: "POST",
    body: payload,
  });
}

export async function updateReferralBonusConfig(
  id: string,
  payload: Schemas["ReferralBonusConfigUpdate"],
): Promise<ApiResponse<ReferralBonusConfig>> {
  return apiRequest<ReferralBonusConfig>(`/api/v1/referral-bonus-config/${id}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function deleteReferralBonusConfig(id: string): Promise<ApiResponse<null>> {
  return apiRequest<null>(`/api/v1/referral-bonus-config/${id}`, {
    method: "DELETE",
  });
}

export async function listReferralBonusConfigs(): Promise<ApiResponse<ReferralBonusConfig[]>> {
  const res = await apiRequest<Schemas["ReferralBonusConfigListResponse"]>(
    `/api/v1/referral-bonus-config`,
  );
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.configs };
}

export async function listReferralPayoutActivity(): Promise<
  ApiResponse<ReferralPayoutActivity[]>
> {
  const res = await apiRequest<Schemas["ReferralPayoutActivityListResponse"]>(
    `/api/v1/referral-bonus-config/payout-activity/recent`,
  );
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.activity };
}
