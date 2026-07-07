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
  registerInitiate,
  registerSetPassword,
  registerVerifyOtp,
  resendOtp,
} from "@/lib/auth";
import { formatMobile, isValidMobile, toE164 } from "@/lib/phone";

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
  // Name fields validate live once the user has left them once (on blur). Until
  // then we stay quiet so we don't nag mid-typing on a fresh field.
  const [touched, setTouched] = React.useState<{ firstName?: boolean; lastName?: boolean }>({});

  function set<K extends keyof Details>(key: K, value: Details[K]) {
    setDetails((d) => ({ ...d, [key]: value }));
    // Live re-validate a name field on every keystroke, but only after it's been
    // touched — clears the error the moment it's fixed, surfaces it as they type.
    if ((key === "firstName" || key === "lastName") && touched[key]) {
      validateName(key, value as string);
    }
  }

  // Per-field validation for the name inputs, mirroring the rules in
  // validateDetails so submit and live checks never disagree.
  function validateName(key: "firstName" | "lastName", value: string) {
    const label = key === "firstName" ? "first" : "last";
    const v = value.trim();
    const msg = !v
      ? `Enter your ${label} name.`
      : !NAME_RE.test(v)
        ? "Use letters only."
        : undefined;
    setErrors((e) => ({ ...e, [key]: msg }));
  }

  function touchName(key: "firstName" | "lastName") {
    setTouched((t) => ({ ...t, [key]: true }));
    validateName(key, details[key]);
  }

  function validateDetails() {
    const next: Partial<Record<keyof Details, string>> = {};
    if (!details.firstName.trim()) next.firstName = "Enter your first name.";
    else if (!NAME_RE.test(details.firstName.trim()))
      next.firstName = "Use letters only.";
    if (!details.lastName.trim()) next.lastName = "Enter your last name.";
    else if (!NAME_RE.test(details.lastName.trim()))
      next.lastName = "Use letters only.";
    if (!EMAIL_RE.test(details.email.trim()))
      next.email = "Enter a valid email address.";
    if (!isValidMobile(details.mobile))
      next.mobile = "Enter a valid 10-digit mobile number.";
    setErrors(next);
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
      if (result.data.otpHint) {
        toast.info("Dev verification code", {
          description: result.data.otpHint,
        });
      }
    } else {
      toast.error(result.error || "Couldn't start sign-up.", {
        description: "Please check your details and try again.",
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
                  onBlur={() => touchName("firstName")}
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
                  onBlur={() => touchName("lastName")}
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
            onClick={() => setStep(0)}
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
              }
              return result;
            }}
            onResend={() => resendOtp(e164, "register")}
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
            onSubmit={async (password, confirm) => {
              const result = await registerSetPassword(
                registrationToken,
                password,
                confirm
              );
              if (result.ok) {
                // set-password returns tokens (and sets the refresh cookie), so
                // the account is signed in straight away.
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
