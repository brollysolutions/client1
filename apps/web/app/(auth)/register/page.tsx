"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Lock, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth/auth-shell";
import { LineSelect } from "@/components/auth/line-select";
import { MobileInput } from "@/components/auth/mobile-input";
import { OtpForm } from "@/components/auth/otp-form";
import { SetPasswordForm } from "@/components/auth/set-password-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  registerInitiate,
  registerSetPassword,
  registerVerifyOtp,
  resendOtp,
  type BusinessLine,
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Details = {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  lines: BusinessLine[];
};

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = React.useState(0);

  const [details, setDetails] = React.useState<Details>({
    firstName: "",
    lastName: "",
    email: "",
    mobile: "",
    lines: [],
  });
  const [errors, setErrors] = React.useState<Partial<Record<keyof Details, string>>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [e164, setE164] = React.useState("");
  const [registrationToken, setRegistrationToken] = React.useState("");

  function set<K extends keyof Details>(key: K, value: Details[K]) {
    setDetails((d) => ({ ...d, [key]: value }));
  }

  function validateDetails() {
    const next: Partial<Record<keyof Details, string>> = {};
    if (!details.firstName.trim()) next.firstName = "Enter your first name.";
    if (!details.lastName.trim()) next.lastName = "Enter your last name.";
    if (!EMAIL_RE.test(details.email)) next.email = "Enter a valid email address.";
    if (!isValidMobile(details.mobile))
      next.mobile = "Enter a valid 10-digit mobile number.";
    if (details.lines.length === 0)
      next.lines = "Choose at least one service.";
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
      lines: details.lines,
    });
    setSubmitting(false);

    if (result.ok) {
      setE164(mobileE164);
      setStep(1);
      if (result.data.otpHint) {
        toast.info(`Dev code: ${result.data.otpHint}`);
      }
    } else {
      toast.error(result.error || "Couldn't start sign-up. Please try again.");
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
            <h1 className="font-heading text-3xl font-bold text-text-primary">
              Sign up
            </h1>
            <p className="text-sm text-text-secondary">
              Enter your details to get started.
            </p>
          </div>

          <form onSubmit={submitDetails} noValidate className="mt-8 space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  value={details.firstName}
                  onChange={(e) => set("firstName", e.target.value)}
                  autoComplete="given-name"
                  placeholder="Jane"
                  aria-invalid={!!errors.firstName}
                  aria-describedby={errors.firstName ? "firstName-error" : undefined}
                  disabled={submitting}
                />
                {errors.firstName && (
                  <p id="firstName-error" className="text-sm text-destructive">
                    {errors.firstName}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  value={details.lastName}
                  onChange={(e) => set("lastName", e.target.value)}
                  autoComplete="family-name"
                  placeholder="Doe"
                  aria-invalid={!!errors.lastName}
                  aria-describedby={errors.lastName ? "lastName-error" : undefined}
                  disabled={submitting}
                />
                {errors.lastName && (
                  <p id="lastName-error" className="text-sm text-destructive">
                    {errors.lastName}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
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
              />
              {errors.email && (
                <p id="email-error" className="text-sm text-destructive">
                  {errors.email}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="mobile">Phone number</Label>
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

            <div className="space-y-2">
              <Label>Which services are you interested in?</Label>
              <LineSelect
                value={details.lines}
                onChange={(lines) => set("lines", lines)}
                disabled={submitting}
                invalid={!!errors.lines}
              />
              {errors.lines && (
                <p className="text-sm text-destructive">{errors.lines}</p>
              )}
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={submitting}>
              {submitting ? "Sending code…" : "Continue"}
              {!submitting && <ArrowRight className="h-4 w-4" />}
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
            className="mb-8 inline-flex items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text-primary focus-visible:text-text-primary focus-visible:outline-none"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-sky/25 text-brand-navy">
            <Smartphone className="h-6 w-6" />
          </span>

          <div className="mb-6 space-y-2">
            <h1 className="font-heading text-3xl font-bold text-text-primary">
              Verify your phone
            </h1>
            <p className="text-sm text-text-secondary">
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
          <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-sky/25 text-brand-navy">
            <Lock className="h-6 w-6" />
          </span>

          <div className="mb-6 space-y-2">
            <h1 className="font-heading text-3xl font-bold text-text-primary">
              Create a password
            </h1>
            <p className="text-sm text-text-secondary">
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
                toast.success("Account created! You can now log in.");
                router.push("/login");
              }
              return result;
            }}
          />
        </>
      )}
    </AuthShell>
  );
}
