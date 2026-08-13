import { describe, expect, it } from "vitest";

import { ADMIN_FREQUENT_ACTIONS } from "./admin-home";

describe("AdminHome frequent actions", () => {
  it("replaces the removed Audit log entry with Lead assignments", () => {
    expect(ADMIN_FREQUENT_ACTIONS).toContainEqual(
      expect.objectContaining({ href: "/dashboard/admin-leads", title: "Lead assignments" }),
    );
    expect(ADMIN_FREQUENT_ACTIONS).not.toContainEqual(
      expect.objectContaining({ href: "/dashboard/audit-log" }),
    );
  });
});
