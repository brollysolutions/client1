import { describe, expect, it } from "vitest";

import { formatAgentLeadExpiry, isAgentLeadExpiryDue } from "./lead-expiry";

const NOW = Date.parse("2026-08-06T00:00:00Z");

describe("formatAgentLeadExpiry", () => {
  it("counts calendar-sized 24-hour periods up to the deadline", () => {
    expect(formatAgentLeadExpiry("new", "2026-09-05T00:00:00Z", null, NOW)).toBe(
      "Expires in 30 days",
    );
    expect(formatAgentLeadExpiry("working", "2026-08-06T12:00:00Z", null, NOW)).toBe(
      "Expires in 1 day",
    );
  });

  it("distinguishes scheduler-pending, terminal, and expired ownership", () => {
    expect(formatAgentLeadExpiry("assigned", "2026-08-05T00:00:00Z", null, NOW)).toBe(
      "Expiry due — awaiting pool release",
    );
    expect(formatAgentLeadExpiry("converted", "2026-08-05T00:00:00Z", null, NOW)).toBe(
      "No longer subject to expiry",
    );
    expect(
      formatAgentLeadExpiry(
        "expired",
        "2026-08-05T00:00:00Z",
        "2026-08-06T00:00:00Z",
        NOW,
      ),
    ).toBe("Expired 6 Aug 2026 — returned to pool");
  });

  it("formats the transition date in the product's India timezone", () => {
    expect(
      formatAgentLeadExpiry(
        "expired",
        "2026-08-06T00:00:00Z",
        "2026-08-06T20:00:00Z",
        NOW,
      ),
    ).toContain("7 Aug 2026");
  });

  it("treats a reached non-terminal deadline as due", () => {
    expect(isAgentLeadExpiryDue("assigned", "2026-08-05T00:00:00Z", null, NOW)).toBe(true);
    expect(isAgentLeadExpiryDue("converted", "2026-08-05T00:00:00Z", null, NOW)).toBe(
      false,
    );
    expect(isAgentLeadExpiryDue("new", "invalid", null, NOW)).toBe(false);
  });
});
