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
export type AgentApplicationDetail = Schemas["AgentApplicationDetailRead"];
export type AgentApplicationDocument = Schemas["AgentApplicationDocument"];
export type AgentApproveResponse = Schemas["AgentApproveResponse"];
export type AdminTask = Schemas["AdminTaskRead"];
export type AdminEmployee = Schemas["AdminEmployeeRead"];
export type AdminLead = Schemas["AdminLeadRead"];
export type AdminAssignedLead = Schemas["AdminAssignedLeadRead"];
export type AdminLoanApplication = Schemas["AdminLoanApplicationRead"];
export type LoanApplicationProgressUpdate = Schemas["LoanApplicationProgressUpdate"];
export type AdminPropertyDeal = Schemas["AdminPropertyDealRead"];
export type PropertyDealProgressUpdate = Schemas["PropertyDealProgressUpdate"];
export type AdminHome = Schemas["AdminHomeResponse"];
export type AdminPendingItem = Schemas["AdminPendingItem"];
export type SupportTicketAdmin = Schemas["SupportTicketAdminRead"];
export type SupportTicketAdvanceRequest = Schemas["SupportTicketAdvanceRequest"];
export type AuditLogEntry = Schemas["AuditLogRead"];
export type AuditAction = Schemas["AuditAction"];
export type MobileChangeAdmin = Schemas["MobileChangeAdminRead"];
export type MobileChangeProof = Schemas["MobileChangeProof"];

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

export async function getAgentApplication(
  id: string,
): Promise<ApiResponse<AgentApplicationDetail>> {
  return apiRequest<AgentApplicationDetail>(`/api/v1/admin/agents/${id}`);
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

export async function listAdminLeads(): Promise<ApiResponse<AdminLead[]>> {
  return apiRequest<AdminLead[]>("/api/v1/admin/leads");
}

export async function assignLead(
  leadId: string,
  telecallerProfileUuid: string,
): Promise<ApiResponse<Schemas["LeadAssignResponse"]>> {
  return apiRequest<Schemas["LeadAssignResponse"]>(`/api/v1/admin/leads/${leadId}/assign`, {
    method: "POST",
    body: { telecaller_staff_profile_uuid: telecallerProfileUuid },
  });
}

export async function listAdminAssignedLeads(): Promise<ApiResponse<AdminAssignedLead[]>> {
  return apiRequest<AdminAssignedLead[]>("/api/v1/admin/leads/assigned");
}

export async function releaseLead(
  leadId: string,
  telecallerProfileUuid: string | null,
  releaseReason: string | null,
): Promise<ApiResponse<Schemas["LeadReleaseResponse"]>> {
  return apiRequest<Schemas["LeadReleaseResponse"]>(`/api/v1/admin/leads/${leadId}/release`, {
    method: "POST",
    body: {
      telecaller_staff_profile_uuid: telecallerProfileUuid,
      release_reason: releaseReason,
    },
  });
}

export async function listAdminEmployees(
  businessLine?: string,
  role?: string,
): Promise<ApiResponse<AdminEmployee[]>> {
  const params = new URLSearchParams();
  if (businessLine) params.set("business_line", businessLine);
  if (role) params.set("role", role);
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<AdminEmployee[]>(`/api/v1/admin/employees${query}`);
}

export async function listAdminLoans(
  statusFilter?: string,
): Promise<ApiResponse<AdminLoanApplication[]>> {
  const query = statusFilter ? `?status_filter=${encodeURIComponent(statusFilter)}` : "";
  const res = await apiRequest<Schemas["AdminLoanApplicationListResponse"]>(
    `/api/v1/admin/loans${query}`,
  );
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.applications };
}

export async function updateAdminLoanApplication(
  applicationId: string,
  payload: LoanApplicationProgressUpdate,
): Promise<ApiResponse<AdminLoanApplication>> {
  return apiRequest<AdminLoanApplication>(`/api/v1/admin/loan-applications/${applicationId}`, {
    method: "PATCH",
    body: payload,
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

export async function getAdminHome(): Promise<ApiResponse<AdminHome>> {
  return apiRequest<AdminHome>("/api/v1/admin/home");
}

export async function listSupportTicketsAdmin(
  statusFilter?: string,
): Promise<ApiResponse<SupportTicketAdmin[]>> {
  const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
  const res = await apiRequest<Schemas["SupportTicketAdminListResponse"]>(
    `/api/v1/admin/support-tickets${query}`,
  );
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.tickets };
}

export async function advanceSupportTicket(
  ticketId: string,
  payload: SupportTicketAdvanceRequest,
): Promise<ApiResponse<SupportTicketAdmin>> {
  return apiRequest<SupportTicketAdmin>(`/api/v1/admin/support-tickets/${ticketId}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function listMobileChangeRequests(): Promise<
  ApiResponse<MobileChangeAdmin[]>
> {
  const res = await apiRequest<Schemas["MobileChangeAdminListResponse"]>(
    "/api/v1/admin/mobile-change-requests",
  );
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.requests };
}

export async function verifyMobileChangeIdentity(
  requestId: string,
  payload: {
    proof_method: MobileChangeProof;
    proof_attestation: string;
    current_password: string;
  },
): Promise<ApiResponse<Schemas["MessageResponse"]>> {
  return apiRequest<Schemas["MessageResponse"]>(
    `/api/v1/admin/mobile-change-requests/${requestId}/verify`,
    { method: "POST", body: payload },
  );
}

export async function completeMobileChange(
  requestId: string,
  currentPassword: string,
): Promise<ApiResponse<Schemas["MessageResponse"]>> {
  return apiRequest<Schemas["MessageResponse"]>(
    `/api/v1/admin/mobile-change-requests/${requestId}/complete`,
    { method: "POST", body: { current_password: currentPassword } },
  );
}

export async function rejectMobileChange(
  requestId: string,
  reason: string,
  currentPassword: string,
): Promise<ApiResponse<Schemas["MessageResponse"]>> {
  return apiRequest<Schemas["MessageResponse"]>(
    `/api/v1/admin/mobile-change-requests/${requestId}/reject`,
    { method: "POST", body: { reason, current_password: currentPassword } },
  );
}

export type AuditLogFilters = {
  action?: AuditAction;
  actorUuid?: string;
  entityType?: string;
  entityUuid?: string;
  limit?: number;
  offset?: number;
};

export async function listAuditLog(
  filters: AuditLogFilters = {},
): Promise<ApiResponse<{ entries: AuditLogEntry[]; total: number }>> {
  const params = new URLSearchParams();
  if (filters.action) params.set("action", filters.action);
  if (filters.actorUuid) params.set("actor_uuid", filters.actorUuid);
  if (filters.entityType) params.set("entity_type", filters.entityType);
  if (filters.entityUuid) params.set("entity_uuid", filters.entityUuid);
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  if (filters.offset !== undefined) params.set("offset", String(filters.offset));
  const query = params.size > 0 ? `?${params.toString()}` : "";
  const res = await apiRequest<Schemas["AuditLogListResponse"]>(
    `/api/v1/admin/audit-log${query}`,
  );
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: { entries: res.data.entries, total: res.data.total } };
}
