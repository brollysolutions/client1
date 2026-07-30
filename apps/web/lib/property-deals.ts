// Property-deal client for the authenticated client dashboard.
//
// Calls GET /api/v1/property-deals/agent through the typed fetch wrapper in
// lib/api/client.ts, same pattern as getMyLoanOfficer() in lib/loans.ts.

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];

export type AgentContact = {
  name: string;
  agentCode: string;
};

// Null is the "no agent assigned yet" state, not an error -- a client with
// no property deal yet, or one whose lead has no origin agent, has no agent
// to show. Contact routes through the support-ticket flow
// (lib/support-tickets.ts); this endpoint never returns phone/email.
export async function getMyAgent(): Promise<ApiResponse<AgentContact | null>> {
  const res = await apiRequest<Schemas["AgentContactRead"] | null>("/api/v1/property-deals/agent");
  if (!res.ok) return res;
  if (res.data === null) return { ok: true, status: res.status, data: null };
  return {
    ok: true,
    status: res.status,
    data: { name: res.data.name, agentCode: res.data.agent_code },
  };
}
