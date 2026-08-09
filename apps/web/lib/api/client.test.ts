import { afterEach, describe, expect, it, vi } from "vitest";

import {
  apiRequest,
  registerBusinessLineGetter,
  registerTokenGetter,
  registerTokenRefresher,
} from "./client";

function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function authHeaders(opts: RequestInit | undefined): string | undefined {
  return (opts?.headers as Record<string, string> | undefined)?.Authorization;
}

afterEach(() => {
  vi.unstubAllGlobals();
  registerTokenGetter(() => null);
  registerBusinessLineGetter(() => null);
  registerTokenRefresher(async () => null);
});

describe("apiRequest 401 -> refresh -> retry", () => {
  it("sends the selected operational line", async () => {
    registerTokenGetter(() => "token");
    registerBusinessLineGetter(() => "real_estate");
    const fetchMock = vi.fn(async (_url: string, _opts?: RequestInit) =>
      fakeResponse(200, { value: 42 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/api/v1/employee/tasks");

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers["X-Business-Line"]).toBe("real_estate");
  });

  it("refreshes once and retries with the new token", async () => {
    registerTokenGetter(() => "old-token");
    let refreshCalls = 0;
    registerTokenRefresher(async () => {
      refreshCalls += 1;
      return "new-token";
    });

    const sent: (string | undefined)[] = [];
    const fetchMock = vi.fn(async (_url: string, opts?: RequestInit) => {
      sent.push(authHeaders(opts));
      return sent.length === 1
        ? fakeResponse(401, { detail: "expired" })
        : fakeResponse(200, { value: 42 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await apiRequest<{ value: number }>("/api/v1/auth/me");

    expect(res.ok && res.data.value).toBe(42);
    expect(refreshCalls).toBe(1);
    expect(sent).toEqual(["Bearer old-token", "Bearer new-token"]);
  });

  it("does not retry when the refresh fails (dead session)", async () => {
    registerTokenGetter(() => "old-token");
    registerTokenRefresher(async () => null);

    const fetchMock = vi.fn(async () => fakeResponse(401, { detail: "expired" }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await apiRequest("/api/v1/auth/me");

    expect(res.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no retry without a new token
  });

  it("skips auto-refresh when the caller passes an explicit bearer", async () => {
    let refreshCalls = 0;
    registerTokenRefresher(async () => {
      refreshCalls += 1;
      return "new-token";
    });

    const fetchMock = vi.fn(async () => fakeResponse(401, { detail: "nope" }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await apiRequest("/api/v1/auth/change-password", {
      method: "POST",
      bearer: "forced-reset-token",
    });

    expect(res.ok).toBe(false);
    expect(refreshCalls).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not auto-refresh the refresh/login handshake itself", async () => {
    let refreshCalls = 0;
    registerTokenRefresher(async () => {
      refreshCalls += 1;
      return "new-token";
    });

    const fetchMock = vi.fn(async () => fakeResponse(401, { detail: "no cookie" }));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/api/v1/auth/refresh", { method: "POST" });

    expect(refreshCalls).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
