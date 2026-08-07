import { afterEach, describe, expect, it, vi } from "vitest";

import {
  initiateAuthenticatedMobileChange,
  initiatePublicMobileChange,
  resendMobileChangeOtp,
  verifyMobileChangeOtp,
} from "@/lib/mobile-change";

function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mobile-change API client", () => {
  it("maps the public challenge and sends both numbers only at initiation", async () => {
    let body: Record<string, unknown> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, options?: RequestInit) => {
        body = JSON.parse(options?.body as string);
        return fakeResponse(200, {
          message: "sent",
          challenge_token: "challenge-1",
          delivery_channel: "none",
          otp_hint: "123456",
        });
      }),
    );

    const response = await initiatePublicMobileChange(
      "+919876543210",
      "+919876543211",
    );

    expect(body).toEqual({
      current_mobile: "+919876543210",
      requested_mobile: "+919876543211",
      company: "",
    });
    expect(response.ok && response.data).toEqual({
      message: "sent",
      challengeToken: "challenge-1",
      deliveryChannel: "none",
      otpHint: "123456",
    });
  });

  it("authenticated initiation sends the replacement and current password", async () => {
    let path = "";
    let body: Record<string, unknown> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options?: RequestInit) => {
        path = url;
        body = JSON.parse(options?.body as string);
        return fakeResponse(200, {
          message: "sent",
          challenge_token: "challenge-2",
          delivery_channel: "voice",
          otp_hint: null,
        });
      }),
    );

    await initiateAuthenticatedMobileChange("+919876543211", "Secret@123");

    expect(path).toContain("/api/v1/mobile-change/authenticated/initiate");
    expect(body).toEqual({
      requested_mobile: "+919876543211",
      current_password: "Secret@123",
    });
  });

  it("verification sends only the signed challenge and OTP", async () => {
    let body: Record<string, unknown> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, options?: RequestInit) => {
        body = JSON.parse(options?.body as string);
        return fakeResponse(200, { message: "submitted" });
      }),
    );

    await verifyMobileChangeOtp("signed-ticket", "123456");

    expect(body).toEqual({ challenge_token: "signed-ticket", otp: "123456" });
    expect(body).not.toHaveProperty("current_mobile");
    expect(body).not.toHaveProperty("requested_mobile");
  });

  it("resend preserves the server-issued challenge", async () => {
    let body: Record<string, unknown> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, options?: RequestInit) => {
        body = JSON.parse(options?.body as string);
        return fakeResponse(200, {
          message: "resent",
          challenge_token: "signed-ticket",
          delivery_channel: "none",
          otp_hint: "654321",
        });
      }),
    );

    const response = await resendMobileChangeOtp("signed-ticket");

    expect(body).toEqual({ challenge_token: "signed-ticket" });
    expect(response.ok && response.data.otpHint).toBe("654321");
  });
});
