import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];
export type AdminUser = Schemas["AdminUserRead"];

export type AdminUserQuery = {
  limit?: number;
  offset?: number;
  search?: string;
  status?: "active" | "suspended" | "pending_password_reset" | "soft_deleted";
  role?: "admin" | "sub_admin" | "telecaller" | "employee" | "agent" | "client";
  businessLine?: "loans" | "real_estate";
  /** `YYYY-MM-DD`, widened to the full day server-side by the `<` upper bound. */
  createdFrom?: string;
  createdTo?: string;
  neverLoggedIn?: boolean;
};

/**
 * Every filter is applied server-side. Filtering the fetched page in the browser
 * — which is what this surface used to do — hides a match that happens to live
 * on another page.
 */
export async function getOperationalUsers(
  query: AdminUserQuery = {},
): Promise<ApiResponse<Schemas["AdminUserListResponse"]>> {
  const params = new URLSearchParams({
    limit: String(query.limit ?? 25),
    offset: String(query.offset ?? 0),
  });
  if (query.search) params.set("search", query.search);
  if (query.status) params.set("status", query.status);
  if (query.role) params.set("role", query.role);
  if (query.businessLine) params.set("business_line", query.businessLine);
  if (query.createdFrom) params.set("created_from", `${query.createdFrom}T00:00:00Z`);
  // Exclusive upper bound, so the whole of the chosen day is included.
  if (query.createdTo) params.set("created_to", `${query.createdTo}T23:59:59Z`);
  if (query.neverLoggedIn !== undefined) params.set("never_logged_in", String(query.neverLoggedIn));
  return apiRequest<Schemas["AdminUserListResponse"]>(`/api/v1/admin/users?${params}`);
}

export async function setOperationalUserStatus(
  id: string,
  body: Schemas["AdminUserStatusUpdateRequest"],
): Promise<ApiResponse<AdminUser>> {
  return apiRequest<AdminUser>(`/api/v1/admin/users/${id}/status`, { method: "PATCH", body });
}
