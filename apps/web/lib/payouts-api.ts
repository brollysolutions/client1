// Admin payouts client: maker-checker queue (create / approve / reject / list)
// plus the recipient-search picker for the create form.
//
// Thin typed wrapper over /api/v1/payouts via lib/api/client.ts, same pattern
// as lib/admin-api.ts. Wire shape (snake_case, generated) is surfaced as-is.

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];
export type Payout = Schemas["PayoutRead"];
export type PayoutStatus = Schemas["PayoutStatus"];
export type PayoutCreate = Schemas["PayoutCreate"];
export type PayoutRecipient = Schemas["PayoutRecipientRead"];

// GET /payouts requests limit explicitly (see PAYOUT_PAGE_LIMIT) rather than
// relying on the endpoint's own default, so a filter switch and the initial
// load always agree on how much can be truncated.
export const PAYOUT_PAGE_LIMIT = 100;

export async function listPayouts(statusFilter?: string): Promise<ApiResponse<Payout[]>> {
  const params = new URLSearchParams({ limit: String(PAYOUT_PAGE_LIMIT) });
  // NOTE: the query param is `status_filter`, not `status` — getting this
  // wrong silently returns the unfiltered list with no error.
  if (statusFilter) params.set("status_filter", statusFilter);
  const res = await apiRequest<Schemas["PayoutListResponse"]>(`/api/v1/payouts?${params}`);
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.payouts };
}

export async function createPayout(body: PayoutCreate): Promise<ApiResponse<Payout>> {
  return apiRequest<Payout>("/api/v1/payouts", { method: "POST", body });
}

export async function approvePayout(id: string): Promise<ApiResponse<Payout>> {
  return apiRequest<Payout>(`/api/v1/payouts/${id}/approve`, { method: "POST" });
}

export async function rejectPayout(id: string, reason: string): Promise<ApiResponse<Payout>> {
  return apiRequest<Payout>(`/api/v1/payouts/${id}/reject`, {
    method: "POST",
    body: { reason },
  });
}

export async function searchPayoutRecipients(
  q: string,
): Promise<ApiResponse<PayoutRecipient[]>> {
  const params = new URLSearchParams({ q, limit: "20" });
  const res = await apiRequest<Schemas["PayoutRecipientListResponse"]>(
    `/api/v1/payouts/recipients?${params}`,
  );
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.recipients };
}
