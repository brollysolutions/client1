import { describe, expect, it } from "vitest";

import type { AdminPendingItem } from "@/lib/admin-api";

import { filterPendingReview } from "./admin-home-pending-review";

const items: AdminPendingItem[] = [
  {
    id: "banner-1",
    kind: "banner",
    title: "Monsoon loans offer",
    business_line: "loans",
    submitted_at: "2026-08-10T10:00:00Z",
  },
  {
    id: "property-1",
    kind: "property_submission",
    title: "Cedar Grove apartment",
    business_line: "real_estate",
    submitted_at: "2026-08-12T10:00:00Z",
  },
  {
    id: "agent-1",
    kind: "agent_application",
    title: "Anika Shah",
    business_line: "both",
    submitted_at: "2026-08-11T10:00:00Z",
  },
];

describe("Admin home pending-review filters", () => {
  it("combines text, review kind, line, and inclusive submitted-date filters", () => {
    expect(
      filterPendingReview(items, {
        search: "cedar",
        kind: "property_submission",
        businessLine: "real_estate",
        submittedFrom: "2026-08-12",
        submittedTo: "2026-08-12",
      }),
    ).toEqual([items[1]]);
  });

  it("leaves all loaded review items visible when filters are clear", () => {
    expect(filterPendingReview(items, {})).toEqual(items);
  });
});
