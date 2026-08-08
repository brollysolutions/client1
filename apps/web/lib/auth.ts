// Auth client for the register / login / forgot-password flows.
//
// Calls the real backend under /api/v1/auth/* through the typed fetch wrapper in
// lib/api/client.ts. Request/response wire shapes come from the generated
// contract (packages/contracts/generated/schema.d.ts) so backend types are never
// hand-duplicated; this module maps between those snake_case shapes and the
// camelCase types the UI consumes. The `AuthResult` union is unchanged, so the
// page components that call these functions did not need to change.

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];

export type BusinessLine = "loans" | "real_estate";

// sessionStorage key used to hand the mobile number typed on /login over to
// /forgot-password so the user isn't asked for it a second time. Kept out of the
// URL (query params) because the mobile number is PII.
export const RESET_MOBILE_KEY = "auth:reset-mobile";

// Discriminated union every call returns — callers branch on `ok` and surface
// `error` via a toast / inline message (see the house pattern in lead-dialog).
// The failure arm carries the originating HTTP `status` so pages can tailor the
// toast description (403/429/5xx read differently than a credentials error).
// Client-side validation failures (no round-trip) use 422 so they fall through
// to the caller's default "check your details" hint.
export type AuthResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

// Map an HTTP status to a description that matches the real failure. Returns
// undefined for credential/validation errors (400/401/422) so the caller keeps
// its own "check your details" line; only the cases where that hint would
// misdirect (network, suspension, rate-limit, server fault) get bespoke copy.
export function describeAuthError(status: number): string | undefined {
  if (status === 0) return "Check your connection and try again.";
  if (status === 403) return "This account isn't active. Contact support if you need help.";
  if (status === 429) return "Too many attempts. Please wait a bit and try again.";
  if (status >= 500) return "This one's on us. Please try again shortly.";
  return undefined;
}

export type OtpDelivery = {
  message: string;
  // "none" = all channels mocked/failed (dev): otpHint carries the code so the
  // flow is still testable. Never populated in production.
  deliveryChannel: "voice" | "email" | "none";
  otpHint?: string;
};

export type ServiceLine = "loans" | "real_estate";

export type RegisterDetails = {
  firstName: string;
  lastName: string;
  mobile: string; // E.164, e.g. +919876543210
  serviceLines: ServiceLine[];
  // Format-checked client-side only; the backend never fails registration on
  // an unmatched code (docs/specs/referral-program.md D4).
  referralCode?: string;
};

// One client profile per business line (self-registered clients hold both).
export type ClientLineProfile = {
  businessLine: BusinessLine;
  customerCode: string;
};

export type Me = {
  firstName: string;
  lastName: string;
  mobile: string;
  email: string | null;
  emailVerified: boolean;
  gender: Gender | null;
  genderSelfDescription: string | null;
  incomeSource: IncomeSource | null;
  incomeAmountMinor: number | null;
  incomePeriod: IncomePeriod | null;
  occupation: string | null;
  address: string | null;
  profiles: ClientLineProfile[];
};

export type Gender =
  | "female"
  | "male"
  | "non_binary"
  | "self_described"
  | "prefer_not_to_say";
export type IncomeSource = "net_salary" | "business_income";
export type IncomePeriod = "monthly" | "annual";

export type UserRole =
  | "admin"
  | "sub_admin"
  | "agent"
  | "telecaller"
  | "employee"
  | "client";

export type AuthTokens = {
  accessToken: string;
  expiresIn: number;
  phoneVerified: boolean;
  emailVerified: boolean;
  // Decoded from the access token's `role` claim. Routing hint only (which
  // surface to show); the DB (RLS) is the real access boundary.
  role: UserRole;
  // Decoded from the access token's `force_reset` claim. True for provisioned
  // accounts that must change their password on first login. The DB enforces
  // this; the flag is only a client routing hint.
  forceReset: boolean;
  // Decoded from the access token's `business_line` claim. Only meaningful
  // for single-line staff/agent roles (Agent/Telecaller/Employee); a client's
  // lines live in Me.profiles[] instead, and platform-scoped staff (Admin,
  // some Sub Admin) carry no line at all.
  businessLine: BusinessLine | null;
};

// --- mapping helpers --------------------------------------------------------

// Turn a wire ApiResponse into the AuthResult callers expect, mapping the data
// payload on success and passing the friendly error string through on failure.
function toResult<T, U>(res: ApiResponse<T>, map: (data: T) => U): AuthResult<U> {
  if (res.ok) return { ok: true, data: map(res.data) };
  return { ok: false, error: res.error, status: res.status };
}

type OtpDeliveryResponse =
  | Schemas["RegisterInitiateResponse"]
  | Schemas["ForgotInitiateResponse"]
  | Schemas["ResendOtpResponse"];

function toOtpDelivery(data: OtpDeliveryResponse): OtpDelivery {
  return {
    message: data.message,
    deliveryChannel: data.delivery_channel,
    otpHint: data.otp_hint ?? undefined,
  };
}

const ROLES = new Set<UserRole>([
  "admin",
  "sub_admin",
  "agent",
  "telecaller",
  "employee",
  "client",
]);

// Decode the JWT payload without verifying the signature — the server remains
// the enforcer; these claims only decide which screen to route to next.
function readClaims(accessToken: string): Record<string, unknown> {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload || typeof atob !== "function") return {};
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return {};
  }
}

function toAuthTokens(data: Schemas["AuthTokensResponse"]): AuthTokens {
  const claims = readClaims(data.access_token);
  const role = claims.role as UserRole;
  const businessLine = claims.business_line;
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
    phoneVerified: data.phone_verified,
    emailVerified: data.email_verified,
    role: ROLES.has(role) ? role : "client",
    forceReset: claims.force_reset === true,
    businessLine: businessLine === "loans" || businessLine === "real_estate" ? businessLine : null,
  };
}

// Mirrors the backend password rules (8-128 chars + confirm must match) so the
// flow rejects the same inputs before a round-trip. Returns an error string or
// null when valid.
function validatePassword(password: string, confirm: string): string | null {
  if (password.length < 8) return "Use at least 8 characters.";
  if (password.length > 128) return "Password is too long.";
  if (password !== confirm) return "Passwords do not match.";
  return null;
}

// --- Registration (3 steps) -------------------------------------------------

// POST /auth/register/initiate → sends the phone OTP.
export async function registerInitiate(
  input: RegisterDetails,
): Promise<AuthResult<OtpDelivery>> {
  const res = await apiRequest<Schemas["RegisterInitiateResponse"]>(
    "/api/v1/auth/register/initiate",
    {
      method: "POST",
      body: {
        first_name: input.firstName,
        last_name: input.lastName,
        mobile: input.mobile,
        service_lines: input.serviceLines,
        referral_code: input.referralCode || undefined,
      } satisfies Schemas["RegisterInitiateRequest"],
    },
  );
  return toResult(res, toOtpDelivery);
}

// POST /auth/register/verify-otp → returns a short-lived registration token.
export async function registerVerifyOtp(
  mobile: string,
  otp: string,
): Promise<AuthResult<{ registrationToken: string }>> {
  const res = await apiRequest<Schemas["RegistrationTokenResponse"]>(
    "/api/v1/auth/register/verify-otp",
    {
      method: "POST",
      body: { mobile, otp } satisfies Schemas["RegisterVerifyOtpRequest"],
    },
  );
  return toResult(res, (data) => ({ registrationToken: data.registration_token }));
}

// POST /auth/register/set-password → finalizes the account.
export async function registerSetPassword(
  registrationToken: string,
  password: string,
  confirmPassword: string,
): Promise<AuthResult<AuthTokens>> {
  const invalid = validatePassword(password, confirmPassword);
  if (invalid) return { ok: false, error: invalid, status: 422 };

  const res = await apiRequest<Schemas["AuthTokensResponse"]>(
    "/api/v1/auth/register/set-password",
    {
      method: "POST",
      body: {
        registration_token: registrationToken,
        password,
        confirm_password: confirmPassword,
      } satisfies Schemas["SetPasswordRequest"],
    },
  );
  return toResult(res, toAuthTokens);
}

// --- Login ------------------------------------------------------------------

// POST /auth/login.
export async function login(
  mobile: string,
  password: string,
): Promise<AuthResult<AuthTokens>> {
  if (!password) return { ok: false, error: "Enter your password.", status: 422 };

  const res = await apiRequest<Schemas["AuthTokensResponse"]>("/api/v1/auth/login", {
    method: "POST",
    body: { mobile, password } satisfies Schemas["LoginRequest"],
  });
  return toResult(res, toAuthTokens);
}

function mapMe(d: Schemas["MeResponse"]): Me {
  return {
    firstName: d.first_name,
    lastName: d.last_name,
    mobile: d.mobile,
    email: d.email,
    emailVerified: d.email_verified,
    gender: d.gender ?? null,
    genderSelfDescription: d.gender_self_description ?? null,
    incomeSource: d.income_source ?? null,
    incomeAmountMinor: d.income_amount_minor ?? null,
    incomePeriod: d.income_period ?? null,
    occupation: d.occupation ?? null,
    address: d.address ?? null,
    profiles: d.profiles.map((p) => ({
      businessLine: p.business_line,
      customerCode: p.customer_code,
    })),
  };
}

// GET /auth/me → the logged-in user + one profile (with its code) per line.
export async function getMe(): Promise<AuthResult<Me>> {
  const res = await apiRequest<Schemas["MeResponse"]>("/api/v1/auth/me", {
    method: "GET",
  });
  return toResult(res, mapMe);
}

// PATCH /auth/me → update the client's own name (and optionally email). mobile is
// immutable. Changing the email resets verification server-side, so the returned
// Me carries emailVerified:false and the verify banner reappears. Returns the
// fresh Me so the shell (me-provider) can update in place.
export async function updateProfile(input: {
  firstName: string;
  lastName: string;
  email?: string | null;
  gender?: Gender | null;
  genderSelfDescription?: string | null;
  incomeSource?: IncomeSource | null;
  incomeAmountMinor?: number | null;
  incomePeriod?: IncomePeriod | null;
  occupation?: string | null;
  address?: string | null;
}): Promise<AuthResult<Me>> {
  const res = await apiRequest<Schemas["MeResponse"]>("/api/v1/auth/me", {
    method: "PATCH",
    body: {
      first_name: input.firstName,
      last_name: input.lastName,
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.gender !== undefined ? { gender: input.gender } : {}),
      ...(input.genderSelfDescription !== undefined
        ? { gender_self_description: input.genderSelfDescription }
        : {}),
      ...(input.incomeSource !== undefined ? { income_source: input.incomeSource } : {}),
      ...(input.incomeAmountMinor !== undefined
        ? { income_amount_minor: input.incomeAmountMinor }
        : {}),
      ...(input.incomePeriod !== undefined ? { income_period: input.incomePeriod } : {}),
      ...(input.occupation !== undefined ? { occupation: input.occupation } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
    } satisfies Schemas["MeUpdateRequest"],
  });
  return toResult(res, mapMe);
}

// DELETE /auth/me → permanently deletes the account (SRS 5.1). Re-confirmation
// is the current password, same bar as change-password. On success the server
// has already blacklisted this access token and cleared the refresh cookie, so
// the caller should clear the local session directly, not call logout().
export async function deleteAccount(currentPassword: string): Promise<AuthResult> {
  const res = await apiRequest<Schemas["MessageResponse"]>("/api/v1/auth/me", {
    method: "DELETE",
    body: { current_password: currentPassword } satisfies Schemas["AccountDeleteRequest"],
  });
  return toResult(res, () => undefined);
}

// Serialize /auth/refresh across all tabs of this origin. The refresh cookie is
// shared per-origin and rotated on every use; if two tabs refresh at once they
// send the same cookie, and the second (now stale) one trips server-side reuse
// detection — which revokes the entire token chain and logs BOTH tabs out. The
// Web Locks API lets only one refresh run at a time; each subsequent waiter then
// sends the freshly-rotated cookie and succeeds. Falls back to running directly
// where locks are unavailable (older browsers, SSR).
async function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks) return fn();
  let result!: T;
  await locks.request("auth-refresh", async () => {
    result = await fn();
  });
  return result;
}

// POST /auth/refresh → rotates the refresh cookie, returns a fresh access token.
// No body: the httponly refresh_token cookie rides along via credentials:include.
export async function refresh(): Promise<AuthResult<AuthTokens>> {
  return withRefreshLock(async () => {
    const res = await apiRequest<Schemas["AuthTokensResponse"]>("/api/v1/auth/refresh", {
      method: "POST",
    });
    return toResult(res, toAuthTokens);
  });
}

// POST /auth/logout → blacklists the access token JTI and revokes the refresh row.
// Needs the Bearer token (attached by the client from the in-memory getter).
export async function logout(): Promise<AuthResult> {
  const res = await apiRequest<Schemas["MessageResponse"]>("/api/v1/auth/logout", {
    method: "POST",
  });
  return toResult(res, () => undefined);
}

// POST /auth/change-password → Bearer-authed. Used for the forced first-login
// reset: a provisioned account logs in with its temporary password (which we
// carry over as `currentPassword`) and sets a new one here. The `bearer` token
// is passed explicitly because the forced-reset access token is deliberately
// kept out of the app session until the reset succeeds.
export async function changePassword(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
  bearer?: string,
): Promise<AuthResult> {
  const invalid = validatePassword(newPassword, confirmPassword);
  if (invalid) return { ok: false, error: invalid, status: 422 };

  const res = await apiRequest<Schemas["MessageResponse"]>(
    "/api/v1/auth/change-password",
    {
      method: "POST",
      bearer,
      body: {
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      } satisfies Schemas["ChangePasswordRequest"],
    },
  );
  return toResult(res, () => undefined);
}

// --- Forgot password (2 steps + a mobile-entry view) ------------------------

// POST /auth/forgot/initiate → sends the reset OTP.
export async function forgotInitiate(
  mobile: string,
): Promise<AuthResult<OtpDelivery>> {
  const res = await apiRequest<Schemas["ForgotInitiateResponse"]>(
    "/api/v1/auth/forgot/initiate",
    {
      method: "POST",
      body: { mobile } satisfies Schemas["ForgotInitiateRequest"],
    },
  );
  return toResult(res, toOtpDelivery);
}

// POST /auth/forgot/verify → returns a short-lived reset token.
export async function forgotVerify(
  mobile: string,
  otp: string,
): Promise<AuthResult<{ resetToken: string }>> {
  const res = await apiRequest<Schemas["ResetTokenResponse"]>(
    "/api/v1/auth/forgot/verify",
    {
      method: "POST",
      body: { mobile, otp } satisfies Schemas["ForgotVerifyRequest"],
    },
  );
  return toResult(res, (data) => ({ resetToken: data.reset_token }));
}

// POST /auth/forgot/reset → sets the new password.
export async function forgotReset(
  resetToken: string,
  newPassword: string,
  confirmPassword: string,
): Promise<AuthResult> {
  const invalid = validatePassword(newPassword, confirmPassword);
  if (invalid) return { ok: false, error: invalid, status: 422 };

  const res = await apiRequest<Schemas["MessageResponse"]>("/api/v1/auth/forgot/reset", {
    method: "POST",
    body: {
      reset_token: resetToken,
      new_password: newPassword,
      confirm_password: confirmPassword,
    } satisfies Schemas["ResetPasswordRequest"],
  });
  return toResult(res, () => undefined);
}

// --- OTP utility ------------------------------------------------------------

// POST /auth/otp/resend.
export async function resendOtp(
  mobile: string,
  purpose: "register" | "reset",
  viaEmail = false,
): Promise<AuthResult<OtpDelivery>> {
  const res = await apiRequest<Schemas["ResendOtpResponse"]>("/api/v1/auth/otp/resend", {
    method: "POST",
    body: {
      mobile,
      purpose,
      via_email: viaEmail,
    } satisfies Schemas["ResendOtpRequest"],
  });
  return toResult(res, toOtpDelivery);
}

// --- Email verification (post-login soft 2FA) ------------------------------

// POST /auth/email/verify/initiate → Bearer-authed; sends a 6-digit code to the
// account email. Returns the same OTP-delivery shape as the phone flows so the
// UI can reuse OtpForm.
export async function emailVerifyInitiate(): Promise<AuthResult<OtpDelivery>> {
  const res = await apiRequest<Schemas["EmailVerifyInitiateResponse"]>(
    "/api/v1/auth/email/verify/initiate",
    { method: "POST" },
  );
  return toResult(res, toOtpDelivery);
}

// POST /auth/email/verify/confirm → Bearer-authed; marks the email verified.
export async function emailVerifyConfirm(otp: string): Promise<AuthResult> {
  const res = await apiRequest<Schemas["MessageResponse"]>(
    "/api/v1/auth/email/verify/confirm",
    {
      method: "POST",
      body: { otp } satisfies Schemas["EmailVerifyConfirmRequest"],
    },
  );
  return toResult(res, () => undefined);
}
