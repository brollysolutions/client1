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
export type AdminTask = Schemas["AdminTaskRead"];
export type AdminPropertyDeal = Schemas["AdminPropertyDealRead"];
export type PropertyDealProgressUpdate = Schemas["PropertyDealProgressUpdate"];

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

export async function listAdminTasks(statusFilter?: string): Promise<ApiResponse<AdminTask[]>> {
  const query = statusFilter ? `?status_filter=${encodeURIComponent(statusFilter)}` : "";
  return apiRequest<AdminTask[]>(`/api/v1/admin/tasks${query}`);
}

export async function assignTask(
  taskId: string,
  employeeProfileUuid: string,
): Promise<ApiResponse<AdminTask>> {
  return apiRequest<AdminTask>(`/api/v1/admin/tasks/${taskId}/assign`, {
    method: "POST",
    body: { employee_profile_uuid: employeeProfileUuid },
  });
}

export async function listAdminPropertyDeals(
  statusFilter?: string,
): Promise<ApiResponse<AdminPropertyDeal[]>> {
  const query = statusFilter ? `?status_filter=${encodeURIComponent(statusFilter)}` : "";
  const res = await apiRequest<Schemas["AdminPropertyDealListResponse"]>(
    `/api/v1/admin/property-deals${query}`,
  );
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.deals };
}

export async function updateAdminPropertyDealProgress(
  dealId: string,
  payload: PropertyDealProgressUpdate,
): Promise<ApiResponse<AdminPropertyDeal>> {
  return apiRequest<AdminPropertyDeal>(`/api/v1/admin/property-deals/${dealId}`, {
    method: "PATCH",
    body: payload,
  });
}
