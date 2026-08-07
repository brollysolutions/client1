"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";

import {
  AUTH_BACK_LINK_CLASS,
  AUTH_SUBMIT_CLASS,
} from "@/components/auth/auth-styles";
import { AuthShell } from "@/components/auth/auth-shell";
import { MobileInput } from "@/components/auth/mobile-input";
import { OtpForm } from "@/components/auth/otp-form";
import { PasswordField } from "@/components/auth/password-field";
import { useAuth } from "@/components/auth/session-provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  initiateAuthenticatedMobileChange,
  initiatePublicMobileChange,
  resendMobileChangeOtp,
  verifyMobileChangeOtp,
} from "@/lib/mobile-change";
import { formatMobile, isValidMobile, toE164 } from "@/lib/phone";
import { cn } from "@/lib/utils";

const OTP_HINT_ALLOWED = process.env.NEXT_PUBLIC_ENV !== "production";
type View = "details" | "otp" | "submitted";

export default function ChangeMobilePage() {
  const { isAuthenticated, isLoading } = useAuth();
  const [view, setView] = React.useState<View>("details");
  const [currentMobile, setCurrentMobile] = React.useState("");
  const [requestedMobile, setRequestedMobile] = React.useState("");
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [challenge, setChallenge] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<{
    currentMobile?: string;
    requestedMobile?: string;
    currentPassword?: string;
    form?: string;
  }>({});

  async function handleDetails(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const next: typeof errors = {};
    if (!isAuthenticated && !isValidMobile(currentMobile)) {
      next.currentMobile = "Enter the number currently used to log in.";
    }
    if (!isValidMobile(requestedMobile)) {
      next.requestedMobile = "Enter a valid replacement number.";
    }
    if (
      !isAuthenticated &&
      isValidMobile(currentMobile) &&
      isValidMobile(requestedMobile) &&
      toE164(currentMobile) === toE164(requestedMobile)
    ) {
      next.requestedMobile = "The replacement number must be different.";
    }
    if (isAuthenticated && !currentPassword) {
      next.currentPassword = "Enter your current password.";
    }
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    setSubmitting(true);
    setErrors({});
    const response = isAuthenticated
      ? await initiateAuthenticatedMobileChange(
          toE164(requestedMobile),
          currentPassword,
        )
      : await initiatePublicMobileChange(
          toE164(currentMobile),
          toE164(requestedMobile),
        );
    setSubmitting(false);
    if (!response.ok) {
      setErrors({ form: response.error });
      return;
    }
    setChallenge(response.data.challengeToken);
    setView("otp");
    if (response.data.otpHint && OTP_HINT_ALLOWED) {
      toast.info("Dev verification code", {
        description: response.data.otpHint,
      });
    }
  }

  if (isLoading) {
    return (
      <AuthShell
        scene="forgot"
        panelTitle="Protecting your account."
        panelSubtitle="We verify the replacement number before support reviews any identity change."
      >
        <div className="flex justify-center py-12">
          <Loader2 className="h-7 w-7 animate-spin text-brand-cta" />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      scene="forgot"
      panelTitle="A careful way back in."
      panelSubtitle="Verify your replacement number, then our support team completes a two-person identity review."
      steps={["Replacement number", "Support review"]}
      activeStep={view === "details" ? 0 : 1}
    >
      {view === "details" ? (
        <>
          <Link
            href={isAuthenticated ? "/dashboard/support" : "/login"}
            className={cn(
              AUTH_BACK_LINK_CLASS,
              "mb-6 inline-flex items-center gap-2 text-sm focus-visible:outline-none",
            )}
          >
            <ArrowLeft className="h-4 w-4" />
            {isAuthenticated ? "Back to support" : "Back to login"}
          </Link>
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-cta-tint text-brand-cta">
            <Smartphone className="h-6 w-6" />
          </span>
          <div className="space-y-2">
            <h1 className="font-heading text-3xl font-bold text-text-primary">
              Change your login number
            </h1>
            <p className="text-base text-text-secondary">
              We&apos;ll call the replacement number with a six-digit code.
              Support will still verify your identity before making any change.
            </p>
          </div>

          <form onSubmit={handleDetails} noValidate className="mt-6 space-y-4">
            {!isAuthenticated ? (
              <div className="space-y-2">
                <Label htmlFor="current-mobile">Current login number</Label>
                <MobileInput
                  id="current-mobile"
                  value={currentMobile}
                  onChange={(event) => setCurrentMobile(event.target.value)}
                  autoComplete="tel"
                  aria-invalid={!!errors.currentMobile}
                />
                {errors.currentMobile ? (
                  <p className="text-sm text-destructive">{errors.currentMobile}</p>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="requested-mobile">Replacement number</Label>
              <MobileInput
                id="requested-mobile"
                value={requestedMobile}
                onChange={(event) => setRequestedMobile(event.target.value)}
                autoComplete="tel"
                aria-invalid={!!errors.requestedMobile}
              />
              {errors.requestedMobile ? (
                <p className="text-sm text-destructive">{errors.requestedMobile}</p>
              ) : null}
            </div>

            {isAuthenticated ? (
              <div className="space-y-2">
                <Label htmlFor="current-password">Current password</Label>
                <PasswordField
                  id="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                  aria-invalid={!!errors.currentPassword}
                  className="h-12 rounded-lg text-base"
                />
                {errors.currentPassword ? (
                  <p className="text-sm text-destructive">{errors.currentPassword}</p>
                ) : null}
              </div>
            ) : null}

            {errors.form ? (
              <p role="alert" className="text-sm text-destructive">
                {errors.form}
              </p>
            ) : null}
            <Button
              type="submit"
              size="lg"
              className={cn(AUTH_SUBMIT_CLASS, "h-12 w-full text-base")}
              disabled={submitting}
            >
              {submitting ? "Sending code…" : "Verify replacement number"}
            </Button>
          </form>
        </>
      ) : null}

      {view === "otp" ? (
        <>
          <button
            type="button"
            onClick={() => setView("details")}
            className={cn(
              AUTH_BACK_LINK_CLASS,
              "mb-6 inline-flex cursor-pointer items-center gap-2 text-sm focus-visible:outline-none",
            )}
          >
            <ArrowLeft className="h-4 w-4" />
            Change number
          </button>
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-cta-tint text-brand-cta">
            <Smartphone className="h-6 w-6" />
          </span>
          <div className="mb-5 space-y-2">
            <h1 className="font-heading text-3xl font-bold text-text-primary">
              Verify the replacement number
            </h1>
            <p className="text-base text-text-secondary">
              Enter the code sent to {formatMobile(requestedMobile)}.
            </p>
          </div>
          <OtpForm
            submitLabel="Send to support"
            onSubmit={async (otp) => {
              const response = await verifyMobileChangeOtp(challenge, otp);
              if (response.ok) setView("submitted");
              return response;
            }}
            onResend={async () => {
              const response = await resendMobileChangeOtp(challenge);
              if (response.ok && response.data.otpHint && OTP_HINT_ALLOWED) {
                toast.info("Dev verification code", {
                  description: response.data.otpHint,
                });
              }
              return response;
            }}
          />
        </>
      ) : null}

      {view === "submitted" ? (
        <div className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
            <CheckCircle2 className="h-7 w-7" />
          </span>
          <h1 className="mt-5 font-heading text-3xl font-bold text-text-primary">
            Request sent for review
          </h1>
          <p className="mt-3 text-base text-text-secondary">
            If the account is eligible, support will verify your identity. Two
            different Admins must approve the change. Your existing number stays
            active until then.
          </p>
          <Button asChild className="mt-6 w-full">
            <Link href={isAuthenticated ? "/dashboard/support" : "/login"}>
              {isAuthenticated ? "Return to support" : "Return to login"}
            </Link>
          </Button>
        </div>
      ) : null}
    </AuthShell>
  );
}
