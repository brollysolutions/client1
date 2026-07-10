"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Lock, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth/auth-shell";
import { MobileInput } from "@/components/auth/mobile-input";
import { OtpForm } from "@/components/auth/otp-form";
import { SetPasswordForm } from "@/components/auth/set-password-form";
import { useAuth } from "@/components/auth/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  describeAuthError,
  registerInitiate,
  registerSetPassword,
  registerVerifyOtp,
  resendOtp,
} from "@/lib/auth";
import { formatMobile, isValidMobile, toE164 } from "@/lib/phone";

// Defense-in-depth: never render a dev OTP hint in a production build, even if
// the backend (which is the real gate) were ever misconfigured to send one (L3).
const OTP_HINT_ALLOWED = process.env.NEXT_PUBLIC_ENV !== "production";

// Steps 1-2 (OTP verify, set password) rest on server-side sessions (OTP +
// reg_data, both TTL_OTP = 5 min) that a refresh doesn't touch — only this
// component's local state did, sending a mid-wizard refresh all the way back
// to step 0 for no reason. Mirrors the RESET_MOBILE_KEY handoff already used
// for forgot-password. expiresAt is a client-side hint only; the backend
// still rejects a genuinely expired registration token on its own.
const WIZARD_KEY = "auth:register-wizard";
const WIZARD_TTL_MS = 10 * 60 * 1000;

type WizardState = {
  step: number;
  mobile: string;
  e164: string;
  registrationToken: string;
  expiresAt: number;
};

function loadWizard(): WizardState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(WIZARD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WizardState;
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt < Date.now()) {
      window.sessionStorage.removeItem(WIZARD_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveWizard(state: Omit<WizardState, "expiresAt">) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      WIZARD_KEY,
      JSON.stringify({ ...state, expiresAt: Date.now() + WIZARD_TTL_MS }),
    );
  } catch {
    /* storage unavailable — refresh just falls back to step 0 */
  }
}

function clearWizard() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(WIZARD_KEY);
  } catch {
    /* no-op */
  }
}

const STEPS = ["Your details", "Verify phone", "Set password"];

const PANEL = [
  {
    title: "Create your account in under a minute.",
    subtitle:
      "Tell us a little about you. We'll send a quick code to your phone to keep things secure.",
  },
  {
    title: "Just one quick check.",
    subtitle:
      "We've sent a code to your phone to make sure it's really you. Pop it in and you're on your way.",
  },
  {
    title: "Secure your account.",
    subtitle:
      "Choose a strong password — it's the key to everything you'll build here.",
  },
];

// Require a proper domain + a 2+ letter TLD so half-typed addresses ("a@b",
// "a@b.") are rejected.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
// Letters only, with spaces / hyphens / apostrophes allowed between them so real
// names ("Anne-Marie", "O'Brien", "Van Der Berg") still pass. No digits/symbols.
const NAME_RE = /^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/;

type Details = {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
};

export default function RegisterPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [step, setStep] = React.useState(0);

  const [details, setDetails] = React.useState<Details>({
    firstName: "",
    lastName: "",
    email: "",
    mobile: "",
  });
  const [errors, setErrors] = React.useState<Partial<Record<keyof Details, string>>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [e164, setE164] = React.useState("");
  const [registrationToken, setRegistrationToken] = React.useState("");
  // Every field validates live once the user has left it once (on blur). Until
  // then we stay quiet so we don't nag mid-typing on a fresh field.
  const [touched, setTouched] = React.useState<Partial<Record<keyof Details, boolean>>>({});

  const hydrated = React.useRef(false);
  React.useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const saved = loadWizard();
    if (saved && saved.step > 0) {
      setStep(saved.step);
      setE164(saved.e164);
      setRegistrationToken(saved.registrationToken);
      setDetails((d) => ({ ...d, mobile: saved.mobile }));
    }
  }, []);

  // Single source of truth for a field's error, shared by the live (on-change)
  // check and the full pre-submit check so the two never disagree.
  function fieldError(key: keyof Details, value: string): string | undefined {
    if (key === "firstName" || key === "lastName") {
      const label = key === "firstName" ? "first" : "last";
      const v = value.trim();
      if (!v) return `Enter your ${label} name.`;
      if (!NAME_RE.test(v)) return "Use letters only.";
      return undefined;
    }
    if (key === "email") {
      return EMAIL_RE.test(value.trim()) ? undefined : "Enter a valid email address.";
    }
    return isValidMobile(value) ? undefined : "Enter a valid 10-digit mobile number.";
  }

  function validateField(key: keyof Details, value: string) {
    setErrors((e) => ({ ...e, [key]: fieldError(key, value) }));
  }

  function touchField(key: keyof Details) {
    setTouched((t) => ({ ...t, [key]: true }));
    validateField(key, details[key]);
  }

  function set<K extends keyof Details>(key: K, value: Details[K]) {
    setDetails((d) => ({ ...d, [key]: value }));
    // Live re-validate on every keystroke, but only after the field has been
    // touched — clears the error the moment it's fixed, surfaces it as they type.
    if (touched[key]) validateField(key, value as string);
  }

  function validateDetails() {
    const next: Partial<Record<keyof Details, string>> = {};
    (Object.keys(details) as (keyof Details)[]).forEach((key) => {
      const msg = fieldError(key, details[key]);
      if (msg) next[key] = msg;
    });
    setErrors(next);
    // A submit attempt makes every field "touched" so edits from here on
    // live-clear immediately, even for a field the user never blurred.
    setTouched({ firstName: true, lastName: true, email: true, mobile: true });
    return Object.keys(next).length === 0;
  }

  async function submitDetails(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!validateDetails()) return;

    setSubmitting(true);
    const mobileE164 = toE164(details.mobile);
    const result = await registerInitiate({
      firstName: details.firstName.trim(),
      lastName: details.lastName.trim(),
      email: details.email.trim().toLowerCase(),
      mobile: mobileE164,
    });
    setSubmitting(false);

    if (result.ok) {
      setE164(mobileE164);
      setStep(1);
      saveWizard({ step: 1, mobile: details.mobile, e164: mobileE164, registrationToken: "" });
      if (result.data.otpHint && OTP_HINT_ALLOWED) {
        toast.info("Dev verification code", {
          description: result.data.otpHint,
        });
      }
    } else {
      toast.error(result.error || "Couldn't start sign-up.", {
        description:
          describeAuthError(result.status) ??
          "Please check your details and try again.",
      });
    }
  }

  return (
    <AuthShell
      panelTitle={PANEL[step].title}
      panelSubtitle={PANEL[step].subtitle}
      steps={STEPS}
      activeStep={step}
    >
      {step === 0 && (
        <>
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text-primary focus-visible:text-text-primary focus-visible:outline-none"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>

          <div className="space-y-2">
            <h1 className="font-heading text-4xl font-bold text-text-primary">
              Sign up
            </h1>
            <p className="text-base text-text-secondary">
              Enter your details to get started.
            </p>
          </div>

          <form onSubmit={submitDetails} noValidate className="mt-10 space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-[15px]">
                  First name
                </Label>
                <Input
                  id="firstName"
                  value={details.firstName}
                  onChange={(e) => set("firstName", e.target.value)}
                  onBlur={() => touchField("firstName")}
                  autoComplete="given-name"
                  placeholder="Jane"
                  aria-invalid={!!errors.firstName}
                  aria-describedby={errors.firstName ? "firstName-error" : undefined}
                  disabled={submitting}
                  className="h-12 rounded-lg text-base"
                />
                {errors.firstName && (
                  <p id="firstName-error" className="text-sm text-destructive">
                    {errors.firstName}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-[15px]">
                  Last name
                </Label>
                <Input
                  id="lastName"
                  value={details.lastName}
                  onChange={(e) => set("lastName", e.target.value)}
                  onBlur={() => touchField("lastName")}
                  autoComplete="family-name"
                  placeholder="Doe"
                  aria-invalid={!!errors.lastName}
                  aria-describedby={errors.lastName ? "lastName-error" : undefined}
                  disabled={submitting}
                  className="h-12 rounded-lg text-base"
                />
                {errors.lastName && (
                  <p id="lastName-error" className="text-sm text-destructive">
                    {errors.lastName}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-[15px]">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={details.email}
                onChange={(e) => set("email", e.target.value)}
                onBlur={() => touchField("email")}
                autoComplete="email"
                placeholder="jane@company.com"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? "email-error" : undefined}
                disabled={submitting}
                className="h-12 rounded-lg text-base"
              />
              {errors.email && (
                <p id="email-error" className="text-sm text-destructive">
                  {errors.email}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="mobile" className="text-[15px]">
                Phone number
              </Label>
              <MobileInput
                id="mobile"
                value={details.mobile}
                onChange={(e) => set("mobile", e.target.value)}
                onBlur={() => touchField("mobile")}
                autoComplete="tel"
                placeholder="98765 43210"
                aria-invalid={!!errors.mobile}
                aria-describedby={errors.mobile ? "mobile-error" : undefined}
                disabled={submitting}
              />
              {errors.mobile && (
                <p id="mobile-error" className="text-sm text-destructive">
                  {errors.mobile}
                </p>
              )}
            </div>

            <Button
              type="submit"
              size="lg"
              className="h-12 w-full text-base"
              disabled={submitting}
            >
              {submitting ? "Sending code…" : "Continue"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-text-secondary">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-brand-navy underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
            >
              Log in
            </Link>
          </p>
        </>
      )}

      {step === 1 && (
        <>
          <button
            type="button"
            onClick={() => {
              clearWizard();
              setStep(0);
            }}
            className="mb-8 inline-flex cursor-pointer items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text-primary focus-visible:text-text-primary focus-visible:outline-none"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <span className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-sky/25 text-brand-navy">
            <Smartphone className="h-7 w-7" />
          </span>

          <div className="mb-8 space-y-2">
            <h1 className="font-heading text-4xl font-bold text-text-primary">
              Verify your phone
            </h1>
            <p className="text-base text-text-secondary">
              We sent a 6-digit code to{" "}
              <span className="font-medium text-text-primary">
                {formatMobile(details.mobile)}
              </span>
              .
            </p>
          </div>

          <OtpForm
            submitLabel="Verify & continue"
            onSubmit={async (otp) => {
              const result = await registerVerifyOtp(e164, otp);
              if (result.ok) {
                setRegistrationToken(result.data.registrationToken);
                setStep(2);
                saveWizard({
                  step: 2,
                  mobile: details.mobile,
                  e164,
                  registrationToken: result.data.registrationToken,
                });
              }
              return result;
            }}
            onResend={async () => {
              const result = await resendOtp(e164, "register");
              // Resend regenerates the OTP, so the code shown on initiate is now
              // dead. Surface the fresh dev hint (L7), same gate as initiate.
              if (result.ok && result.data.otpHint && OTP_HINT_ALLOWED) {
                toast.info("Dev verification code", {
                  description: result.data.otpHint,
                });
              }
              return result;
            }}
          />
        </>
      )}

      {step === 2 && (
        <>
          <span className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-sky/25 text-brand-navy">
            <Lock className="h-7 w-7" />
          </span>

          <div className="mb-8 space-y-2">
            <h1 className="font-heading text-4xl font-bold text-text-primary">
              Create a password
            </h1>
            <p className="text-base text-text-secondary">
              Set a password to secure your account.
            </p>
          </div>

          <SetPasswordForm
            passwordLabel="Create password"
            submitLabel="Create account"
            mobile={details.mobile}
            onSubmit={async (password, confirm) => {
              const result = await registerSetPassword(
                registrationToken,
                password,
                confirm
              );
              if (result.ok) {
                // set-password returns tokens (and sets the refresh cookie), so
                // the account is signed in straight away.
                clearWizard();
                setSession(result.data);
                toast.success("Account created!", {
                  description: "Welcome aboard. Taking you in now.",
                });
                router.replace("/dashboard");
              }
              return result;
            }}
          />
        </>
      )}
    </AuthShell>
  );
}
