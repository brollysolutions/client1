import { afterEach, describe, expect, it, vi } from "vitest";

import { login, registerInitiate } from "@/lib/auth";

// Guards the snake_case <-> camelCase mapping and the FastAPI error extraction.
// These are the pieces most likely to break silently when the OpenAPI contract
// is regenerated, so they are worth pinning even though the flows are also
// exercised end-to-end.

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  });
}

function tokenWith(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `header.${payload}.signature`;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("login()", () => {
  it("maps AuthTokensResponse (snake) to AuthTokens (camel)", async () => {
    const token = tokenWith({ sub: "u", force_reset: false });
    vi.stubGlobal(
      "fetch",
      mockFetch(200, {
        access_token: token,
        token_type: "bearer",
        expires_in: 1800,
        phone_verified: true,
        email_verified: false,
      }),
    );

    const res = await login("+919000000007", "pw");

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.accessToken).toBe(token);
      expect(res.data.expiresIn).toBe(1800);
      expect(res.data.phoneVerified).toBe(true);
      expect(res.data.emailVerified).toBe(false);
      expect(res.data.forceReset).toBe(false);
    }
  });

  it("decodes force_reset=true from the access-token claim", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(200, {
        access_token: tokenWith({ sub: "u", force_reset: true }),
        token_type: "bearer",
        expires_in: 1800,
        phone_verified: true,
        email_verified: false,
      }),
    );

    const res = await login("+919000000007", "pw");
    expect(res.ok && res.data.forceReset).toBe(true);
  });

  it("surfaces the backend detail string on a 4xx", async () => {
    vi.stubGlobal("fetch", mockFetch(401, { detail: "Invalid mobile number or password." }));
    const res = await login("+919000000007", "pw");
    expect(res).toEqual({ ok: false, error: "Invalid mobile number or password." });
  });

  it("extracts detail[].msg on a 422 and strips the 'Value error, ' prefix", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(422, { detail: [{ msg: "Value error, mobile is invalid", loc: [], type: "x" }] }),
    );
    const res = await login("+919000000007", "pw");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("mobile is invalid");
  });

  it("hides internals on a 5xx", async () => {
    vi.stubGlobal("fetch", mockFetch(500, { detail: "raw traceback" }));
    const res = await login("+919000000007", "pw");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/on our end/i);
  });

  it("returns a friendly error when the network is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    const res = await login("+919000000007", "pw");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/reach the server/i);
  });
});

describe("registerInitiate()", () => {
  const details = {
    firstName: "Test",
    lastName: "User",
    mobile: "+919000000007",
    email: "t@example.com",
  };

  it("maps otp_hint -> otpHint", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(200, { message: "sent", delivery_channel: "none", otp_hint: "123456" }),
    );
    const res = await registerInitiate({ ...details });
    expect(res.ok && res.data.otpHint).toBe("123456");
    expect(res.ok && res.data.deliveryChannel).toBe("none");
  });

  it("maps a null otp_hint to undefined", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(200, { message: "sent", delivery_channel: "voice", otp_hint: null }),
    );
    const res = await registerInitiate({ ...details });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.otpHint).toBeUndefined();
  });
});
