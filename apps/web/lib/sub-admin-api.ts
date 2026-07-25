// Sub Admin client — the composed home summary (slice 5).
//
// Thin typed wrapper over /api/v1/sub-admin via lib/api/client.ts, same
// pattern as lib/employee-api.ts's getEmployeeHome.

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];
export type SubAdminHome = Schemas["SubAdminHomeResponse"];
export type PendingApprovalItem = Schemas["PendingApprovalItem"];

export async function getSubAdminHome(): Promise<ApiResponse<SubAdminHome>> {
  return apiRequest<SubAdminHome>("/api/v1/sub-admin/home");
}
