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
