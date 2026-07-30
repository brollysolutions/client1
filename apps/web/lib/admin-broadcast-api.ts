// Admin broadcast notifications (feature-status.md §3-12). Thin typed
// wrapper over /api/v1/notifications/broadcast + .../broadcast/preview,
// same pattern as lib/admin-commissions-api.ts.

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];
export type BroadcastAudience = Schemas["BroadcastAudience"];
export type BroadcastRequest = Schemas["BroadcastRequest"];

export async function previewBroadcast(
  audience: BroadcastAudience,
  businessLine?: "loans" | "real_estate",
): Promise<ApiResponse<number>> {
  const params = new URLSearchParams({ audience });
  if (businessLine) params.set("business_line", businessLine);
  const res = await apiRequest<Schemas["BroadcastPreviewResponse"]>(
    `/api/v1/notifications/broadcast/preview?${params}`,
  );
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.recipients };
}

export async function sendBroadcast(body: BroadcastRequest): Promise<ApiResponse<number>> {
  const res = await apiRequest<Schemas["BroadcastResponse"]>("/api/v1/notifications/broadcast", {
    method: "POST",
    body,
  });
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.recipients };
}
