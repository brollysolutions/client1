"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import type { AuthResult } from "@/lib/auth";

const RESEND_SECONDS = 30;

// Shared 6-digit OTP entry used by both the register (verify phone) and forgot
// (verify number) flows. Owns the code, the submit lifecycle, and the resend
// countdown; the surrounding heading/icon/back-link live in each page.
export function OtpForm({
  submitLabel = "Continue",
  onSubmit,
  onResend,
}: {
  submitLabel?: string;
  onSubmit: (otp: string) => Promise<AuthResult<unknown>>;
  onResend: () => Promise<AuthResult<unknown>>;
}) {
  const [otp, setOtp] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
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

  async function handleResend() {
    const result = await onResend();
    if (result.ok) {
      setSeconds(RESEND_SECONDS);
      setError(null);
    } else {
      setError(result.error || "Couldn't resend the code. Please try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div className="space-y-2">
        <label
          htmlFor="otp-input"
          className="text-sm font-medium text-text-primary"
        >
          Enter OTP
        </label>
        <InputOTP
          id="otp-input"
          maxLength={6}
          value={otp}
          onChange={setOtp}
          disabled={submitting}
          containerClassName="justify-start"
          aria-invalid={!!error}
          aria-describedby={error ? "otp-error" : undefined}
        >
          <InputOTPGroup className="gap-2 sm:gap-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <InputOTPSlot
                key={i}
                index={i}
                className="h-12 w-11 rounded-lg border bg-card text-lg sm:w-12"
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
        className="w-full"
        disabled={submitting || otp.length !== 6}
      >
        {submitting ? "Verifying…" : submitLabel}
      </Button>

      <p className="text-center text-sm text-text-secondary">
        {seconds > 0 ? (
          `Resend code in ${seconds}s`
        ) : (
          <>
            Didn&apos;t get a code?{" "}
            <button
              type="button"
              onClick={handleResend}
              className="cursor-pointer font-medium text-brand-navy underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline"
            >
              Resend
            </button>
          </>
        )}
      </p>
    </form>
  );
}
