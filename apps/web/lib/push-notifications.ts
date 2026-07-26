// Web push client for the authenticated dashboard.
//
// Calls /api/v1/push through the typed fetch wrapper in lib/api/client.ts,
// same pattern as lib/notifications.ts. The wire shapes are already flat
// snake_case (no camelCase mapping needed — these bodies never reach UI state
// directly, they're consumed by use-push-subscription.ts).

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];

export async function getVapidPublicKey(): Promise<ApiResponse<string>> {
  const res = await apiRequest<Schemas["VapidPublicKeyResponse"]>("/api/v1/push/vapid-public-key");
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.public_key };
}

export async function subscribePush(
  subscription: Schemas["PushSubscribeRequest"],
): Promise<ApiResponse<null>> {
  const res = await apiRequest<null>("/api/v1/push/subscribe", {
    method: "POST",
    body: subscription,
  });
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: null };
}

export async function unsubscribePush(endpoint: string): Promise<ApiResponse<null>> {
  const res = await apiRequest<null>("/api/v1/push/unsubscribe", {
    method: "POST",
    body: { endpoint } satisfies Schemas["PushUnsubscribeRequest"],
  });
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: null };
}
