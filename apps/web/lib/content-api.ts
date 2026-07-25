// Content-blocks client for the Sub Admin CMS surface + Admin read-only oversight.
//
// Thin typed wrapper over /api/v1/content-blocks via lib/api/client.ts. Mirrors
// lib/offers-api.ts's shape: no approve/reject, because content publishes
// directly with no Admin gate.

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];
export type ContentBlock = Schemas["ContentBlockRead"];
export type ContentStatus = ContentBlock["status"];

export async function createContentBlock(
  payload: Schemas["ContentBlockCreate"],
): Promise<ApiResponse<ContentBlock>> {
  return apiRequest<ContentBlock>(`/api/v1/content-blocks`, {
    method: "POST",
    body: payload,
  });
}

export async function updateContentBlock(
  id: string,
  payload: Schemas["ContentBlockUpdate"],
): Promise<ApiResponse<ContentBlock>> {
  return apiRequest<ContentBlock>(`/api/v1/content-blocks/${id}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function listContentBlocks(
  status?: ContentStatus,
): Promise<ApiResponse<ContentBlock[]>> {
  const qs = status ? `?status_filter=${status}` : "";
  const res = await apiRequest<Schemas["ContentBlockListResponse"]>(
    `/api/v1/content-blocks${qs}`,
  );
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.content_blocks };
}

export async function publishContentBlock(id: string): Promise<ApiResponse<ContentBlock>> {
  return apiRequest<ContentBlock>(`/api/v1/content-blocks/${id}/publish`, {
    method: "POST",
  });
}

export async function archiveContentBlock(id: string): Promise<ApiResponse<ContentBlock>> {
  return apiRequest<ContentBlock>(`/api/v1/content-blocks/${id}/archive`, {
    method: "POST",
  });
}
