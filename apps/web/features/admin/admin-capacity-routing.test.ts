import { describe, expect, it } from "vitest";

import { STAFF_CAPACITY_HINT, STAFF_CAPACITY_HREF } from "./admin-capacity-routing";

describe("Admin lead-capacity routing", () => {
  it("takes a capacity alert to staff management, not the removed queue", () => {
    expect(STAFF_CAPACITY_HREF).toBe("/dashboard/users");
    expect(STAFF_CAPACITY_HINT).toContain("Telecaller");
  });
});
