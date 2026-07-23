// Telecaller client — assigned-lead list/detail, status update, call log, home.
//
// Thin typed wrapper over /api/v1/telecaller via lib/api/client.ts, same pattern
// as lib/admin-api.ts. Wire shape (snake_case, generated) is surfaced as-is.

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];
export type TelecallerLead = Schemas["TelecallerLeadRead"];
export type TelecallerLeadDetail = Schemas["TelecallerLeadDetailRead"];
export type TelecallerLeadUpdate = Schemas["TelecallerLeadUpdate"];
export type LeadActivity = Schemas["LeadActivityRead"];
export type LeadActivityCreate = Schemas["LeadActivityCreate"];
export type TelecallerHome = Schemas["TelecallerHomeResponse"];
export type TelecallerLoanApplication = Schemas["TelecallerLoanApplicationRead"];
export type LoanTxn = Schemas["LoanTxnRead"];
export type LoanTxnCreate = Schemas["LoanTxnCreate"];
export type Task = Schemas["TaskRead"];
export type TaskCreate = Schemas["TaskCreate"];

export async function listTelecallerLeads(
  statusFilter?: string,
): Promise<ApiResponse<TelecallerLead[]>> {
  const query = statusFilter ? `?status_filter=${encodeURIComponent(statusFilter)}` : "";
  return apiRequest<TelecallerLead[]>(`/api/v1/telecaller/leads${query}`);
}

export async function getTelecallerLead(
  leadId: string,
): Promise<ApiResponse<TelecallerLeadDetail>> {
  return apiRequest<TelecallerLeadDetail>(`/api/v1/telecaller/leads/${leadId}`);
}

export async function updateTelecallerLead(
  leadId: string,
  payload: TelecallerLeadUpdate,
): Promise<ApiResponse<TelecallerLead>> {
  return apiRequest<TelecallerLead>(`/api/v1/telecaller/leads/${leadId}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function logCallActivity(
  leadId: string,
  payload: LeadActivityCreate,
): Promise<ApiResponse<LeadActivity>> {
  return apiRequest<LeadActivity>(`/api/v1/telecaller/leads/${leadId}/activities`, {
    method: "POST",
    body: payload,
  });
}

export async function getTelecallerHome(): Promise<ApiResponse<TelecallerHome>> {
  return apiRequest<TelecallerHome>("/api/v1/telecaller/home");
}

export async function addLoanTxn(
  applicationId: string,
  payload: LoanTxnCreate,
): Promise<ApiResponse<LoanTxn>> {
  return apiRequest<LoanTxn>(`/api/v1/telecaller/loan-applications/${applicationId}/txn-history`, {
    method: "POST",
    body: payload,
  });
}

export async function raiseFieldTask(
  leadId: string,
  payload: TaskCreate,
): Promise<ApiResponse<Task>> {
  return apiRequest<Task>(`/api/v1/telecaller/leads/${leadId}/tasks`, {
    method: "POST",
    body: payload,
  });
}
