// Admin field-visibility configuration. Wire types stay generated-contract owned.

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];
export type FieldVisibilityEntry = Schemas["FieldVisibilityEntryRead"];
export type FieldVisibilityUpdate = Schemas["FieldVisibilityUpdateRequest"];

export async function listFieldVisibility(): Promise<ApiResponse<FieldVisibilityEntry[]>> {
  const response = await apiRequest<Schemas["FieldVisibilityListResponse"]>(
    "/api/v1/admin/field-visibility",
  );
  if (!response.ok) return response;
  return { ok: true, status: response.status, data: response.data.entries };
}

export async function updateFieldVisibility(
  payload: FieldVisibilityUpdate,
): Promise<ApiResponse<FieldVisibilityEntry>> {
  return apiRequest<FieldVisibilityEntry>("/api/v1/admin/field-visibility", {
    method: "PUT",
    body: payload,
  });
}

