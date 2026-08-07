"use client";

import * as React from "react";
import { REGEXP_ONLY_DIGITS } from "input-otp";

import { AUTH_LINK_CLASS, AUTH_SUBMIT_CLASS } from "@/components/auth/auth-styles";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import type { AuthResult } from "@/lib/auth";
import { cn } from "@/lib/utils";

const RESEND_SECONDS = 30;

// Shared 6-digit OTP entry used by both the register (verify phone) and forgot
// (verify number) flows. Owns the code, the submit lifecycle, and the resend
// countdown; the surrounding heading/icon/back-link live in each page.
export function OtpForm({
  submitLabel = "Continue",
  onSubmit,
  onResend,
  onAlternateResend,
  alternateResendLabel = "Use another delivery method",
}: {
  submitLabel?: string;
  onSubmit: (otp: string) => Promise<AuthResult<unknown>>;
  onResend: () => Promise<AuthResult<unknown>>;
  onAlternateResend?: () => Promise<AuthResult<unknown>>;
  alternateResendLabel?: string;
}) {
  const [otp, setOtp] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [resending, setResending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [seconds, setSeconds] = React.useState(RESEND_SECONDS);

  React.useEffect(() => {
    if (seconds <= 0) return;
    const t = setInterval(() => setSeconds((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [seconds]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting || otp.length !== 6) return;
    setSubmitting(true);
    setError(null);

    const result = await onSubmit(otp);
    if (!result.ok) {
      setSubmitting(false);
      setOtp("");
      setError(result.error || "That code didn't match. Please try again.");
    }
    // On success the parent advances the step; keep the button disabled.
  }

  async function handleResend(resend: () => Promise<AuthResult<unknown>>) {
    // Guard re-entrancy: without it, rapid clicks each fire POST /otp/resend and
    // trip the backend's 3-per-window cap -> a 1-hour lock mid-flow (audit M2).
    if (resending) return;
    setResending(true);
    try {
      const result = await resend();
      if (result.ok) {
        setSeconds(RESEND_SECONDS);
        setError(null);
      } else {
        setError(result.error || "Couldn't resend the code. Please try again.");
      }
    } finally {
      setResending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="space-y-2">
        <label
          htmlFor="otp-input"
          className="text-[15px] font-medium text-text-primary"
        >
          Enter OTP
        </label>
        <InputOTP
          id="otp-input"
          maxLength={6}
          pattern={REGEXP_ONLY_DIGITS}
          inputMode="numeric"
          value={otp}
          onChange={setOtp}
          disabled={submitting}
          containerClassName="justify-start"
          aria-invalid={!!error}
          aria-describedby={error ? "otp-error" : undefined}
        >
          <InputOTPGroup className="grid w-full grid-cols-6 gap-2 sm:gap-2.5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <InputOTPSlot
                key={i}
                index={i}
                className="h-12 w-full rounded-lg border bg-card text-xl"
              />
            ))}
          </InputOTPGroup>
        </InputOTP>
        {error && (
          <p id="otp-error" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <Button
        type="submit"
        size="lg"
        className={cn(AUTH_SUBMIT_CLASS, "h-12 w-full text-base")}
        disabled={submitting || otp.length !== 6}
      >
        {submitting ? "Verifying…" : submitLabel}
      </Button>

      <div className="text-center text-sm text-text-secondary">
        {seconds > 0 ? (
          `Resend code in ${seconds}s`
        ) : (
          <div className="space-y-2">
            <p>
              Didn&apos;t get a code?{" "}
              <button
                type="button"
                onClick={() => void handleResend(onResend)}
                disabled={resending}
                className={cn(
                  AUTH_LINK_CLASS,
                  "cursor-pointer font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline disabled:pointer-events-none disabled:opacity-50"
                )}
              >
                {resending ? "Resending…" : "Resend"}
              </button>
            </p>
            {onAlternateResend ? (
              <button
                type="button"
                onClick={() => void handleResend(onAlternateResend)}
                disabled={resending}
                className={cn(
                  AUTH_LINK_CLASS,
                  "cursor-pointer font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline disabled:pointer-events-none disabled:opacity-50"
                )}
              >
                {alternateResendLabel}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </form>
  );
}
