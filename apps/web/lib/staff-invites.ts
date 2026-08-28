// Staff first-login invite links.
//
// Two audiences in one module: the Admin console mints and revokes links, and
// the anonymous /staff-invite page reads and accepts one. They share nothing but
// the token, so keeping them together is what makes the whole handoff readable
// in one place.

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];

export type StaffInviteLink = Schemas["StaffInviteLinkRead"];
export type StaffInvitePreview = Schemas["StaffInvitePreview"];

/** Admin-only. The raw token is in `share_path` and is never returned again. */
export function createStaffInviteLink(
  authUserUuid: string,
): Promise<ApiResponse<StaffInviteLink>> {
  return apiRequest<StaffInviteLink>(
    `/api/v1/admin/users/${encodeURIComponent(authUserUuid)}/invite-link`,
    { method: "POST" },
  );
}

/** Admin-only. */
export function revokeStaffInviteLink(linkId: string): Promise<ApiResponse<null>> {
  return apiRequest<null>(`/api/v1/admin/invite-links/${encodeURIComponent(linkId)}`, {
    method: "DELETE",
  });
}

/** Anonymous. 404 covers unknown, expired, used, and revoked alike. */
export function getStaffInvite(token: string): Promise<ApiResponse<StaffInvitePreview>> {
  return apiRequest<StaffInvitePreview>(`/api/v1/staff-invites/${encodeURIComponent(token)}`);
}

/** Anonymous. Sets the invitee's own password and burns the link. */
export function acceptStaffInvite(
  token: string,
  password: string,
  confirmPassword: string,
): Promise<ApiResponse<{ message: string }>> {
  return apiRequest<{ message: string }>(
    `/api/v1/staff-invites/${encodeURIComponent(token)}/accept`,
    { method: "POST", body: { password, confirm_password: confirmPassword } },
  );
}
