import type { UserRole } from "@/lib/auth";

const FIXED_DESKTOP_SIDEBAR_ROLES = new Set<UserRole>([
  "admin",
  "sub_admin",
  "agent",
  "telecaller",
  "employee",
]);

export function hasFixedDesktopSidebar(role: UserRole | null | undefined): boolean {
  return role != null && FIXED_DESKTOP_SIDEBAR_ROLES.has(role);
}

export function isDesktopSidebarExpanded(
  role: UserRole | null | undefined,
  clientPreference: boolean,
): boolean {
  return hasFixedDesktopSidebar(role) || (role === "client" && clientPreference);
}
