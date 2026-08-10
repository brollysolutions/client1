import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getAdminLeadDetails,
  getClientLeadDetails,
  updateAdminLeadDetails,
  updateClientLeadDetails,
} from "@/lib/lead-details-api";

function fakeResponse(): Response {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        id: "00000000-0000-0000-0000-000000000001",
        business_line: "loans",
        status: "new",
        name: "Lead",
        requirement: null,
        field_owners: { name: "client" },
        editable_fields: ["name", "requirement.notes"],
        updated_at: "2026-08-10T00:00:00Z",
      }),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lead details API client", () => {
  it("uses the generated Client and Admin ownership endpoints", async () => {
    const calls: { path: string; method: string; body?: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options?: RequestInit) => {
        calls.push({
          path: new URL(url).pathname,
          method: options?.method ?? "GET",
          body: options?.body ? JSON.parse(options.body as string) : undefined,
        });
        return fakeResponse();
      }),
    );

    await getClientLeadDetails("loans");
    await updateClientLeadDetails("loans", { notes: "Lower EMI" });
    await getAdminLeadDetails("lead-1");
    await updateAdminLeadDetails("lead-1", {
      name: "Corrected",
      reason: "Verified correction request",
    });

    expect(calls).toEqual([
      { path: "/api/v1/client/lead-details/loans", method: "GET", body: undefined },
      {
        path: "/api/v1/client/lead-details/loans",
        method: "PATCH",
        body: { notes: "Lower EMI" },
      },
      { path: "/api/v1/admin/leads/lead-1/details", method: "GET", body: undefined },
      {
        path: "/api/v1/admin/leads/lead-1/details",
        method: "PATCH",
        body: { name: "Corrected", reason: "Verified correction request" },
      },
    ]);
  });
});
