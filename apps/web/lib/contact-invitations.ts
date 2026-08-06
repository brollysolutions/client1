import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type ContactInvitation = components["schemas"]["ContactInvitationRead"];

export function getContactInvitation(token: string): Promise<ApiResponse<ContactInvitation>> {
  return apiRequest<ContactInvitation>(
    `/api/v1/leads/invitations/${encodeURIComponent(token)}`,
  );
}

