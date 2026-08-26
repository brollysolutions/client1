import { describe, expect, it } from "vitest";

import type { TelecallerLead } from "@/lib/telecaller-api";

import { filterTelecallerLeads, sortTelecallerLeads } from "./telecaller-lead-filters";

function lead(overrides: Partial<TelecallerLead>): TelecallerLead {
  return {
    id: overrides.id ?? "lead-1",
    business_line: "loans",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    mobile: "9876543210",
    name: "Asha Rao",
    status: "assigned",
    last_disposition: null,
    next_follow_up_at: null,
    requirement: null,
    ...overrides,
  };
}

describe("filterTelecallerLeads", () => {
  const leads: TelecallerLead[] = [
    lead({ id: "1", name: "Asha Rao", mobile: "9876543210", status: "working" }),
    lead({ id: "2", name: "Vikram Shah", mobile: "8123456789", status: "converted" }),
    lead({ id: "3", name: null, mobile: "7000011111", status: "new" }),
  ];

  it("matches search against name and mobile", () => {
    expect(filterTelecallerLeads(leads, { search: "asha", status: "all", followUpFrom: "", followUpTo: "" })).toEqual([leads[0]]);
    expect(filterTelecallerLeads(leads, { search: "7000011111", status: "all", followUpFrom: "", followUpTo: "" })).toEqual([leads[2]]);
  });

  it("filters by status", () => {
    expect(filterTelecallerLeads(leads, { search: "", status: "converted", followUpFrom: "", followUpTo: "" })).toEqual([leads[1]]);
  });

  it("filters by follow-up date range", () => {
    const withFollowUp = [
      lead({ id: "a", next_follow_up_at: "2026-02-01T09:00:00Z" }),
      lead({ id: "b", next_follow_up_at: "2026-03-15T09:00:00Z" }),
      lead({ id: "c", next_follow_up_at: null }),
    ];
    expect(
      filterTelecallerLeads(withFollowUp, {
        search: "",
        status: "all",
        followUpFrom: "2026-02-01",
        followUpTo: "2026-02-28",
      }),
    ).toEqual([withFollowUp[0]]);
  });

  it("combines search and status filters", () => {
    expect(
      filterTelecallerLeads(leads, { search: "shah", status: "converted", followUpFrom: "", followUpTo: "" }),
    ).toEqual([leads[1]]);
    expect(
      filterTelecallerLeads(leads, { search: "shah", status: "working", followUpFrom: "", followUpTo: "" }),
    ).toEqual([]);
  });
});

describe("sortTelecallerLeads", () => {
  it("sorts by soonest follow-up first, with never-called leads last regardless of direction", () => {
    const leads: TelecallerLead[] = [
      lead({ id: "later", next_follow_up_at: "2026-03-15T09:00:00Z" }),
      lead({ id: "never", next_follow_up_at: null }),
      lead({ id: "soonest", next_follow_up_at: "2026-02-01T09:00:00Z" }),
    ];

    expect(sortTelecallerLeads(leads, { key: "next_follow_up_at", dir: "asc" }).map((l) => l.id)).toEqual([
      "soonest",
      "later",
      "never",
    ]);
    expect(sortTelecallerLeads(leads, { key: "next_follow_up_at", dir: "desc" }).map((l) => l.id)).toEqual([
      "later",
      "soonest",
      "never",
    ]);
  });

  it("sorts by name alphabetically", () => {
    const leads: TelecallerLead[] = [
      lead({ id: "1", name: "Zara" }),
      lead({ id: "2", name: "Asha" }),
    ];
    expect(sortTelecallerLeads(leads, { key: "name", dir: "asc" }).map((l) => l.id)).toEqual(["2", "1"]);
    expect(sortTelecallerLeads(leads, { key: "name", dir: "desc" }).map((l) => l.id)).toEqual(["1", "2"]);
  });

  it("does not mutate the input array", () => {
    const leads: TelecallerLead[] = [lead({ id: "1", name: "Zara" }), lead({ id: "2", name: "Asha" })];
    const original = [...leads];
    sortTelecallerLeads(leads, { key: "name", dir: "asc" });
    expect(leads).toEqual(original);
  });
});
