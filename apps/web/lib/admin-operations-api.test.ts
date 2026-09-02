import { afterEach, describe, expect, it, vi } from "vitest";

import { registerBusinessLineGetter, registerTokenGetter } from "@/lib/api/client";

import {
  listAdminAuthEvents,
  listAdminEnquiries,
  listAdminFieldVisibilityConfigs,
  listAdminLeadActivities,
  listAdminLoanTransactionHistory,
  listAdminSiteVisits,
  listAdminTransactions,
} from "./admin-operations-api";

function fakeResponse(): Response {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ total: 0 }),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  registerTokenGetter(() => null);
  registerBusinessLineGetter(() => null);
});

describe("Admin operational-record API", () => {
  it("uses the seven dedicated paginated Admin routes", async () => {
    registerTokenGetter(() => "admin-token");
    const fetchMock = vi.fn(async (_url: string, _options?: RequestInit) => fakeResponse());
    vi.stubGlobal("fetch", fetchMock);
    const page = { limit: 10, offset: 20 };

    await listAdminAuthEvents(page);
    await listAdminEnquiries(page);
    await listAdminFieldVisibilityConfigs(page);
    await listAdminLeadActivities(page);
    await listAdminLoanTransactionHistory(page);
    await listAdminSiteVisits(page);
    await listAdminTransactions(page);

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "http://localhost:8000/api/v1/admin/operations/auth-events?limit=10&offset=20",
      "http://localhost:8000/api/v1/admin/operations/enquiries?limit=10&offset=20",
      "http://localhost:8000/api/v1/admin/operations/field-visibility-config?limit=10&offset=20",
      "http://localhost:8000/api/v1/admin/operations/lead-activities?limit=10&offset=20",
      "http://localhost:8000/api/v1/admin/operations/loan-transaction-history?limit=10&offset=20",
      "http://localhost:8000/api/v1/admin/operations/site-visits?limit=10&offset=20",
      "http://localhost:8000/api/v1/admin/operations/transactions?limit=10&offset=20",
    ]);
    for (const [, options] of fetchMock.mock.calls) {
      expect((options?.headers as Record<string, string>).Authorization).toBe(
        "Bearer admin-token",
      );
    }
  });
});
