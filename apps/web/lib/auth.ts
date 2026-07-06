// Auth client for the register / login / forgot-password flows.
//
// Shapes mirror the backend auth schemas (apps/api/app/schemas/auth.py) and the
// endpoints under /api/v1/auth/*. This is currently a STUB that fakes success
// after a short delay so the multi-step UX is fully exercisable without a
// running API — same pattern as lib/leads.ts. When the typed client is
// generated into packages/contracts, swap each function body for the real call;
// the signatures and the `AuthResult` union stay the same so callers don't change.
//
// TODO(auth): wire to POST /api/v1/auth/* via the generated packages/contracts
// client. Add access-token storage + session + post-login redirect at that point.

export type BusinessLine = "loans" | "real_estate";

// sessionStorage key used to hand the mobile number typed on /login over to
// /forgot-password so the user isn't asked for it a second time. Kept out of the
// URL (query params) because the mobile number is PII.
export const RESET_MOBILE_KEY = "auth:reset-mobile";

// Discriminated union every call returns — callers branch on `ok` and surface
// `error` via a toast / inline message (see the house pattern in lead-dialog).
export type AuthResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type OtpDelivery = {
  message: string;
  // "none" = all channels mocked/failed (dev): otpHint carries the code so the
  // flow is still testable. Never populated in production.
  deliveryChannel: "voice" | "email" | "none";
  otpHint?: string;
};

export type RegisterDetails = {
  firstName: string;
  lastName: string;
  mobile: string; // E.164, e.g. +919876543210
  email: string;
  lines: BusinessLine[];
};

export type AuthTokens = {
  accessToken: string;
  expiresIn: number;
  phoneVerified: boolean;
  emailVerified: boolean;
};

const STUB_DELAY = 700;
const STUB_OTP = "123456"; // dev-only hint returned while the API is stubbed

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stubDelivery(message: string): OtpDelivery {
  return {
    message,
    deliveryChannel: "none",
    otpHint: process.env.NODE_ENV !== "production" ? STUB_OTP : undefined,
  };
}

function log(scope: string, payload: unknown) {
  if (process.env.NODE_ENV !== "production") {
    console.info(`[auth] ${scope} (stub)`, payload);
  }
}

// Mirrors the backend password rules (8-128 chars + confirm must match) so the
// stub rejects the same inputs the real endpoint would. Returns an error string
// or null when valid.
function validatePassword(password: string, confirm: string): string | null {
  if (password.length < 8) return "Use at least 8 characters.";
  if (password.length > 128) return "Password is too long.";
  if (password !== confirm) return "Passwords do not match.";
  return null;
}

// --- Registration (3 steps) -------------------------------------------------

// POST /auth/register/initiate → sends the phone OTP.
export async function registerInitiate(
  input: RegisterDetails
): Promise<AuthResult<OtpDelivery>> {
  await delay(STUB_DELAY);
  log("register/initiate", input);
  return { ok: true, data: stubDelivery("Verification code sent.") };
}

// POST /auth/register/verify-otp → returns a short-lived registration token.
export async function registerVerifyOtp(
  mobile: string,
  otp: string
): Promise<AuthResult<{ registrationToken: string }>> {
  await delay(STUB_DELAY);
  log("register/verify-otp", { mobile, otp });
  return { ok: true, data: { registrationToken: "stub-registration-token" } };
}

// POST /auth/register/set-password → finalizes the account.
export async function registerSetPassword(
  registrationToken: string,
  password: string,
  confirmPassword: string
): Promise<AuthResult<AuthTokens>> {
  await delay(STUB_DELAY);
  log("register/set-password", { registrationToken });
  const invalid = validatePassword(password, confirmPassword);
  if (invalid) return { ok: false, error: invalid };
  return {
    ok: true,
    data: {
      accessToken: "stub-access-token",
      expiresIn: 3600,
      phoneVerified: true,
      emailVerified: false,
    },
  };
}

// --- Login ------------------------------------------------------------------

// POST /auth/login.
export async function login(
  mobile: string,
  password: string
): Promise<AuthResult<AuthTokens>> {
  await delay(STUB_DELAY);
  log("login", { mobile });
  if (!password) return { ok: false, error: "Enter your password." };
  return {
    ok: true,
    data: {
      accessToken: "stub-access-token",
      expiresIn: 3600,
      phoneVerified: true,
      emailVerified: false,
    },
  };
}

// --- Forgot password (2 steps + a mobile-entry view) ------------------------

// POST /auth/forgot/initiate → sends the reset OTP.
export async function forgotInitiate(
  mobile: string
): Promise<AuthResult<OtpDelivery>> {
  await delay(STUB_DELAY);
  log("forgot/initiate", { mobile });
  return { ok: true, data: stubDelivery("Reset code sent.") };
}

// POST /auth/forgot/verify → returns a short-lived reset token.
export async function forgotVerify(
  mobile: string,
  otp: string
): Promise<AuthResult<{ resetToken: string }>> {
  await delay(STUB_DELAY);
  log("forgot/verify", { mobile, otp });
  return { ok: true, data: { resetToken: "stub-reset-token" } };
}

// POST /auth/forgot/reset → sets the new password.
export async function forgotReset(
  resetToken: string,
  newPassword: string,
  confirmPassword: string
): Promise<AuthResult> {
  await delay(STUB_DELAY);
  log("forgot/reset", { resetToken });
  const invalid = validatePassword(newPassword, confirmPassword);
  if (invalid) return { ok: false, error: invalid };
  return { ok: true, data: undefined };
}

// --- OTP utility ------------------------------------------------------------

// POST /auth/otp/resend.
export async function resendOtp(
  mobile: string,
  purpose: "register" | "reset",
  viaEmail = false
): Promise<AuthResult<OtpDelivery>> {
  await delay(STUB_DELAY);
  log("otp/resend", { mobile, purpose, viaEmail });
  return { ok: true, data: stubDelivery("A new code is on its way.") };
}
