import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];
export type AdminUser = Schemas["AdminUserRead"];

export async function getOperationalUsers(
  limit = 25,
  offset = 0,
): Promise<ApiResponse<Schemas["AdminUserListResponse"]>> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return apiRequest<Schemas["AdminUserListResponse"]>(`/api/v1/admin/users?${params}`);
}

export async function setOperationalUserStatus(
  id: string,
  body: Schemas["AdminUserStatusUpdateRequest"],
): Promise<ApiResponse<AdminUser>> {
  return apiRequest<AdminUser>(`/api/v1/admin/users/${id}/status`, { method: "PATCH", body });
}
