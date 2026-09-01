// Approved-Agent first-login links.

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];

export type AgentInviteLink = Schemas["AgentInviteLinkRead"];
export type AgentInviteCandidate = Schemas["AgentInviteCandidateRead"];
export type AgentInvitePreview = Schemas["AgentInvitePreview"];

export function listAgentInviteCandidates(): Promise<
  ApiResponse<Schemas["AgentInviteCandidateListResponse"]>
> {
  return apiRequest<Schemas["AgentInviteCandidateListResponse"]>("/api/v1/admin/agent-invites");
}

/** Admin-only. The raw token is returned once in `share_path`. */
export function createAgentInviteLink(
  applicationId: string,
): Promise<ApiResponse<AgentInviteLink>> {
  return apiRequest<AgentInviteLink>(
    `/api/v1/admin/agents/${encodeURIComponent(applicationId)}/invite-link`,
    { method: "POST" },
  );
}

/** Admin-only. */
export function revokeAgentInviteLink(linkId: string): Promise<ApiResponse<null>> {
  return apiRequest<null>(`/api/v1/admin/agent-invite-links/${encodeURIComponent(linkId)}`, {
    method: "DELETE",
  });
}

/** Anonymous. Unknown, expired, used, and revoked links all return 404. */
export function getAgentInvite(token: string): Promise<ApiResponse<AgentInvitePreview>> {
  return apiRequest<AgentInvitePreview>(`/api/v1/agent-invites/${encodeURIComponent(token)}`);
}

/** Anonymous. Sets the Agent's first password and atomically consumes the link. */
export function acceptAgentInvite(
  token: string,
  password: string,
  confirmPassword: string,
): Promise<ApiResponse<{ message: string }>> {
  return apiRequest<{ message: string }>(
    `/api/v1/agent-invites/${encodeURIComponent(token)}/accept`,
    { method: "POST", body: { password, confirm_password: confirmPassword } },
  );
}
