import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];
export type AdminUser = Schemas["AdminUserRead"];

export async function getOperationalUsers(): Promise<ApiResponse<Schemas["AdminUserListResponse"]>> {
  return apiRequest<Schemas["AdminUserListResponse"]>("/api/v1/admin/users");
}

export async function setOperationalUserStatus(
  id: string,
  body: Schemas["AdminUserStatusUpdateRequest"],
): Promise<ApiResponse<AdminUser>> {
  return apiRequest<AdminUser>(`/api/v1/admin/users/${id}/status`, { method: "PATCH", body });
}
