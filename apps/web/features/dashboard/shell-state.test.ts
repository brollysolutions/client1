import { describe, expect, it } from "vitest";

import type { UserRole } from "@/lib/auth";

import { hasFixedDesktopSidebar, isDesktopSidebarExpanded } from "./shell-state";

describe("dashboard desktop sidebar state", () => {
  it("keeps every operational role expanded without a stored preference", () => {
    for (const role of [
      "admin",
      "sub_admin",
      "agent",
      "telecaller",
      "employee",
    ] satisfies UserRole[]) {
      expect(hasFixedDesktopSidebar(role)).toBe(true);
      expect(isDesktopSidebarExpanded(role, false)).toBe(true);
    }
  });

  it("preserves the Client's remembered expand and collapse behavior", () => {
    expect(hasFixedDesktopSidebar("client")).toBe(false);
    expect(isDesktopSidebarExpanded("client", false)).toBe(false);
    expect(isDesktopSidebarExpanded("client", true)).toBe(true);
  });

  it("defaults safely while the authenticated session is hydrating", () => {
    expect(isDesktopSidebarExpanded(undefined, true)).toBe(false);
    expect(isDesktopSidebarExpanded(null, true)).toBe(false);
  });
});
