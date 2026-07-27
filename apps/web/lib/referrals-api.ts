// Client's own referral code + conversion tracking. Read-only — the client
// never writes a referral_codes/referrals row directly (both are issued and
// mutated server-side, see services/referrals.py). Thin typed wrapper over
// /api/v1/referrals, same shape as lib/referral-bonus-api.ts.

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];
export type MyReferral = Schemas["MyReferralResponse"];
export type Referral = Schemas["ReferralRead"];

export async function getMyReferral(): Promise<ApiResponse<MyReferral>> {
  return apiRequest<MyReferral>(`/api/v1/referrals/me`);
}

export async function listReferrals(): Promise<ApiResponse<Referral[]>> {
  const res = await apiRequest<Schemas["ReferralListResponse"]>(`/api/v1/referrals`);
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.referrals };
}
