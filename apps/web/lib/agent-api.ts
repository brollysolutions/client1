// Agent client — home summary, lead introduction/tracking (Agent Dashboard slice 1).
//
// Thin typed wrapper over /api/v1/agent via lib/api/client.ts, same pattern
// as lib/telecaller-api.ts. Wire shape (snake_case, generated) is surfaced as-is.

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];
export type AgentHome = Schemas["AgentHomeResponse"];
export type AgentLead = Schemas["AgentLeadRead"];
export type AgentLeadCreate = Schemas["AgentLeadCreate"];
export type AgentLeadUpdate = Schemas["AgentLeadUpdate"];

export async function getAgentHome(): Promise<ApiResponse<AgentHome>> {
  return apiRequest<AgentHome>("/api/v1/agent/home");
}

export async function listAgentLeads(statusFilter?: string): Promise<ApiResponse<AgentLead[]>> {
  const query = statusFilter ? `?status_filter=${encodeURIComponent(statusFilter)}` : "";
  return apiRequest<AgentLead[]>(`/api/v1/agent/leads${query}`);
}

export async function getAgentLead(leadId: string): Promise<ApiResponse<AgentLead>> {
  return apiRequest<AgentLead>(`/api/v1/agent/leads/${leadId}`);
}

export async function introduceAgentLead(
  payload: AgentLeadCreate,
): Promise<ApiResponse<AgentLead>> {
  return apiRequest<AgentLead>("/api/v1/agent/leads", { method: "POST", body: payload });
}

export async function updateAgentLead(
  leadId: string,
  payload: AgentLeadUpdate,
): Promise<ApiResponse<AgentLead>> {
  return apiRequest<AgentLead>(`/api/v1/agent/leads/${leadId}`, { method: "PATCH", body: payload });
}
