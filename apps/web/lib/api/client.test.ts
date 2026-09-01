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
  it("preserves sanitized FastAPI field issues on a 422 response", async () => {
    const fetchMock = vi.fn(async () =>
      fakeResponse(422, {
        detail: [
          { loc: ["body", "destination", "ifsc"], msg: "Field required", type: "missing" },
          { loc: ["body", "amount_paise"], msg: "Input should be greater than 0", type: "greater_than" },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiRequest("/api/v1/payouts", { method: "POST", body: {} });

    expect(result).toEqual({
      ok: false,
      status: 422,
      error: "Field required",
      issues: [
        { field: "destination.ifsc", message: "Field required" },
        { field: "amount_paise", message: "Input should be greater than 0" },
      ],
    });
  });

  it("drops rejected input and malformed validation locations", async () => {
    const secret = "should-never-reach-the-client-result";
    const fetchMock = vi.fn(async () =>
      fakeResponse(422, {
        detail: [
          {
            loc: ["body", "profile", "email"],
            msg: `Value error, ${"x".repeat(600)}`,
            input: secret,
          },
          { loc: ["body", "field<script>"], msg: "Unsafe field path", input: secret },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiRequest("/api/v1/profile", { method: "PATCH", body: {} });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      { field: "profile.email", message: "x".repeat(500) },
    ]);
    expect(JSON.stringify(result)).not.toContain(secret);
  });

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
