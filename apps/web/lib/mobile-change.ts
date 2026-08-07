// Typed client for support-assisted mobile-number recovery.

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];

export type MobileChangeChallenge = {
  message: string;
  challengeToken: string;
  deliveryChannel: "voice" | "email" | "none";
  otpHint?: string;
};

function mapChallenge(
  data: Schemas["MobileChangeChallengeResponse"],
): MobileChangeChallenge {
  return {
    message: data.message,
    challengeToken: data.challenge_token,
    deliveryChannel: data.delivery_channel,
    otpHint: data.otp_hint ?? undefined,
  };
}

function mapResponse<T, U>(
  response: ApiResponse<T>,
  mapper: (data: T) => U,
): ApiResponse<U> {
  if (!response.ok) return response;
  return { ok: true, status: response.status, data: mapper(response.data) };
}

export async function initiatePublicMobileChange(
  currentMobile: string,
  requestedMobile: string,
): Promise<ApiResponse<MobileChangeChallenge>> {
  const response = await apiRequest<Schemas["MobileChangeChallengeResponse"]>(
    "/api/v1/mobile-change/initiate",
    {
      method: "POST",
      body: {
        current_mobile: currentMobile,
        requested_mobile: requestedMobile,
        company: "",
      } satisfies Schemas["MobileChangePublicInitiateRequest"],
    },
  );
  return mapResponse(response, mapChallenge);
}

export async function initiateAuthenticatedMobileChange(
  requestedMobile: string,
  currentPassword: string,
): Promise<ApiResponse<MobileChangeChallenge>> {
  const response = await apiRequest<Schemas["MobileChangeChallengeResponse"]>(
    "/api/v1/mobile-change/authenticated/initiate",
    {
      method: "POST",
      body: {
        requested_mobile: requestedMobile,
        current_password: currentPassword,
      } satisfies Schemas["MobileChangeAuthenticatedInitiateRequest"],
    },
  );
  return mapResponse(response, mapChallenge);
}

export async function resendMobileChangeOtp(
  challengeToken: string,
): Promise<ApiResponse<MobileChangeChallenge>> {
  const response = await apiRequest<Schemas["MobileChangeChallengeResponse"]>(
    "/api/v1/mobile-change/resend",
    {
      method: "POST",
      body: { challenge_token: challengeToken } satisfies Schemas["MobileChangeResendRequest"],
    },
  );
  return mapResponse(response, mapChallenge);
}

export async function verifyMobileChangeOtp(
  challengeToken: string,
  otp: string,
): Promise<ApiResponse<{ message: string }>> {
  return apiRequest<Schemas["MessageResponse"]>("/api/v1/mobile-change/verify", {
    method: "POST",
    body: {
      challenge_token: challengeToken,
      otp,
    } satisfies Schemas["MobileChangeVerifyOtpRequest"],
  });
}
