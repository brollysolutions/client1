import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";
import type { BusinessLine } from "@/lib/auth";

type Schemas = components["schemas"];

export type LeadDetails = Schemas["LeadDetailsRead"];
export type LeadDetailsPatch = Schemas["LeadDetailsPatch"];
export type AdminLeadDetailsPatch = Schemas["AdminLeadDetailsPatch"];

export function getClientLeadDetails(
  businessLine: BusinessLine,
): Promise<ApiResponse<LeadDetails>> {
  return apiRequest<LeadDetails>(`/api/v1/client/lead-details/${businessLine}`);
}

export function updateClientLeadDetails(
  businessLine: BusinessLine,
  payload: LeadDetailsPatch,
): Promise<ApiResponse<LeadDetails>> {
  return apiRequest<LeadDetails>(`/api/v1/client/lead-details/${businessLine}`, {
    method: "PATCH",
    body: payload,
  });
}

export function getAdminLeadDetails(leadId: string): Promise<ApiResponse<LeadDetails>> {
  return apiRequest<LeadDetails>(`/api/v1/admin/leads/${leadId}/details`);
}

export function updateAdminLeadDetails(
  leadId: string,
  payload: AdminLeadDetailsPatch,
): Promise<ApiResponse<LeadDetails>> {
  return apiRequest<LeadDetails>(`/api/v1/admin/leads/${leadId}/details`, {
    method: "PATCH",
    body: payload,
  });
}
