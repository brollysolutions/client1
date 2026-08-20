import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deleteAccount,
  getMe,
  login,
  registerInitiate,
  resendOtp,
  updateProfile,
} from "@/lib/auth";

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

  it("retains the dual-line staff claim for dashboard switching", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(200, {
        access_token: tokenWith({
          sub: "u",
          role: "telecaller",
          business_line: "both",
          force_reset: false,
        }),
        token_type: "bearer",
        expires_in: 1800,
        phone_verified: true,
        email_verified: true,
      }),
    );

    const res = await login("+919000000007", "pw");
    expect(res.ok && res.data.businessLine).toBe("both");
  });

  it("retains supported staff feature claims and ignores unknown values", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(200, {
        access_token: tokenWith({
          sub: "u",
          role: "sub_admin",
          staff_features: ["payout_requests", "unknown_feature"],
        }),
        token_type: "bearer",
        expires_in: 1800,
        phone_verified: true,
        email_verified: true,
      }),
    );

    const res = await login("+919000000007", "pw");
    expect(res.ok && res.data.staffFeatures).toEqual(["payout_requests"]);
  });

  it("surfaces the backend detail string on a 4xx", async () => {
    vi.stubGlobal("fetch", mockFetch(401, { detail: "Invalid mobile number or password." }));
    const res = await login("+919000000007", "pw");
    expect(res).toEqual({
      ok: false,
      error: "Invalid mobile number or password.",
      status: 401,
    });
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
    serviceLines: ["loans"] as const,
  };

  it("maps otp_hint -> otpHint", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(200, { message: "sent", delivery_channel: "none", otp_hint: "123456" }),
    );
    const res = await registerInitiate({ ...details, serviceLines: [...details.serviceLines] });
    expect(res.ok && res.data.otpHint).toBe("123456");
    expect(res.ok && res.data.deliveryChannel).toBe("none");
  });

  it("maps a null otp_hint to undefined", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(200, { message: "sent", delivery_channel: "voice", otp_hint: null }),
    );
    const res = await registerInitiate({ ...details, serviceLines: [...details.serviceLines] });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.otpHint).toBeUndefined();
  });

  it("sends explicit per-line follow-up intent", async () => {
    const fetchMock = mockFetch(200, {
      message: "sent",
      delivery_channel: "none",
      otp_hint: "123456",
    });
    vi.stubGlobal("fetch", fetchMock);

    await registerInitiate({
      ...details,
      serviceLines: ["loans", "real_estate"],
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      service_lines: ["loans", "real_estate"],
    });
  });
});

describe("profile mapping", () => {
  it("maps nullable optional profile fields", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(200, {
        first_name: "Test",
        last_name: "User",
        mobile: "+919000000007",
        email: null,
        email_verified: false,
        gender: "prefer_not_to_say",
        gender_self_description: null,
        income_source: "business_income",
        income_amount_minor: 12_500_000,
        income_period: "annual",
        occupation: "Business owner",
        location: "Kondapur, Hyderabad",
        profiles: [],
      }),
    );

    const res = await getMe();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.email).toBeNull();
      expect(res.data.gender).toBe("prefer_not_to_say");
      expect(res.data.incomeAmountMinor).toBe(12_500_000);
      expect(res.data.location).toBe("Kondapur, Hyderabad");
    }
  });

  it("sends explicit nulls when optional details are cleared", async () => {
    const fetchMock = mockFetch(200, {
      first_name: "Test",
      last_name: "User",
      mobile: "+919000000007",
      email: null,
      email_verified: false,
      gender: null,
      gender_self_description: null,
      income_source: null,
      income_amount_minor: null,
      income_period: null,
      occupation: null,
      location: null,
      profiles: [],
    });
    vi.stubGlobal("fetch", fetchMock);

    await updateProfile({
      firstName: "Test",
      lastName: "User",
      email: null,
      gender: null,
      genderSelfDescription: null,
      incomeSource: null,
      incomeAmountMinor: null,
      incomePeriod: null,
      occupation: null,
      location: null,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      email: null,
      gender: null,
      income_source: null,
      income_amount_minor: null,
      income_period: null,
      occupation: null,
      location: null,
    });
  });
});

describe("resendOtp()", () => {
  it("maps an explicit verified-email recovery request", async () => {
    const fetchMock = mockFetch(200, {
      message: "Code resent.",
      delivery_channel: "none",
      otp_hint: null,
    });
    vi.stubGlobal("fetch", fetchMock);

    await resendOtp("+919000000007", "reset", true);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      mobile: "+919000000007",
      purpose: "reset",
      via_email: true,
    });
  });
});

describe("deleteAccount()", () => {
  it("sends current_password as the DELETE body and reports ok", async () => {
    const fetchMock = mockFetch(200, { message: "Your account has been deleted." });
    vi.stubGlobal("fetch", fetchMock);

    const res = await deleteAccount("MyPass@1234");

    expect(res.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body as string)).toEqual({ current_password: "MyPass@1234" });
  });

  it("surfaces a wrong-password 401 as a friendly error", async () => {
    vi.stubGlobal("fetch", mockFetch(401, { detail: "Current password is incorrect." }));
    const res = await deleteAccount("WrongPass@1");
    expect(res).toEqual({
      ok: false,
      error: "Current password is incorrect.",
      status: 401,
    });
  });

  it("surfaces an already-deleted 409", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(409, { detail: "This account has already been deleted." }),
    );
    const res = await deleteAccount("MyPass@1234");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(409);
  });
});
