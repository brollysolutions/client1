import { afterEach, describe, expect, it, vi } from "vitest";

import {
  listAuthenticatedPlacements,
  revokePersonalizationLocation,
  setPersonalizationPreference,
} from "@/lib/personalization-api";

function fakeResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("personalization API client", () => {
  it("sends consent and legacy-location removal actions", async () => {
    const calls: { url: string; method: string; body?: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options?: RequestInit) => {
        calls.push({
          url,
          method: options?.method ?? "GET",
          body: options?.body ? JSON.parse(options.body as string) : undefined,
        });
        return fakeResponse({
          personalization_enabled: true,
          location_enabled: true,
          location_captured_at: "2026-08-07T00:00:00Z",
        });
      }),
    );

    await setPersonalizationPreference(true);
    await revokePersonalizationLocation();

    expect(calls.map(({ url, method, body }) => ({
      path: new URL(url).pathname,
      method,
      body,
    }))).toEqual([
      {
        path: "/api/v1/personalization/preferences",
        method: "PATCH",
        body: { personalization_enabled: true },
      },
      {
        path: "/api/v1/personalization/location",
        method: "DELETE",
        body: undefined,
      },
    ]);
  });

  it("requests only the selected dashboard line", async () => {
    let requestedUrl = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        requestedUrl = url;
        return fakeResponse({ banners: [], offers: [] });
      }),
    );

    await listAuthenticatedPlacements("real_estate");

    const url = new URL(requestedUrl);
    expect(url.pathname).toBe("/api/v1/personalization/placements");
    expect(url.searchParams.get("business_line")).toBe("real_estate");
  });
});
