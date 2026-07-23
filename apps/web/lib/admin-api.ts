// Admin client for staff provisioning + the agent-application approval queue.
//
// Thin typed wrapper over /api/v1/admin via lib/api/client.ts, same pattern as
// lib/property-submissions-api.ts. Wire shape (snake_case, generated) is
// surfaced as-is; temp_password is present only on the single response right
// after create/approve and is never re-fetchable afterward.

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];
export type StaffCreateRequest = Schemas["StaffCreateRequest"];
export type StaffCreateResponse = Schemas["StaffCreateResponse"];
export type AgentApplication = Schemas["AgentApplicationRead"];
export type AgentApproveResponse = Schemas["AgentApproveResponse"];

export async function createStaff(
  payload: StaffCreateRequest,
): Promise<ApiResponse<StaffCreateResponse>> {
  return apiRequest<StaffCreateResponse>("/api/v1/admin/users/create", {
    method: "POST",
    body: payload,
  });
}

export async function listPendingAgentApplications(): Promise<ApiResponse<AgentApplication[]>> {
  const res = await apiRequest<Schemas["AgentApplicationListResponse"]>("/api/v1/admin/agents");
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.applications };
}

export async function approveAgentApplication(
  id: string,
): Promise<ApiResponse<AgentApproveResponse>> {
  return apiRequest<AgentApproveResponse>(`/api/v1/admin/agents/${id}/approve`, {
    method: "POST",
  });
}

export async function rejectAgentApplication(
  id: string,
  note: string,
): Promise<ApiResponse<AgentApplication>> {
  return apiRequest<AgentApplication>(`/api/v1/admin/agents/${id}/reject`, {
    method: "POST",
    body: { note },
  });
}
