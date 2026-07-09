"use client";

import * as React from "react";
import { MailCheck, X } from "lucide-react";
import { toast } from "sonner";

import { OtpForm } from "@/components/auth/otp-form";
import { Button } from "@/components/ui/button";
import { emailVerifyConfirm, emailVerifyInitiate } from "@/lib/auth";

// Defense-in-depth: never render a dev OTP hint in a production build (L3).
const OTP_HINT_ALLOWED = process.env.NEXT_PUBLIC_ENV !== "production";

// Post-login soft 2FA (Auth Design email-verify flow). Shown only when the
// session reports email_verified=false. Sends a 6-digit code to the account
// email and confirms it, reusing the shared OtpForm. Non-blocking: the user can
// dismiss it and keep using the dashboard; onVerified lets the parent flip its
// local state so the banner does not reappear this session.
export function EmailVerifyBanner({ onVerified }: { onVerified: () => void }) {
  const [dismissed, setDismissed] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [showOtp, setShowOtp] = React.useState(false);

  async function startVerification() {
    if (sending) return;
    setSending(true);
    try {
      const result = await emailVerifyInitiate();
      if (result.ok) {
        setShowOtp(true);
        if (result.data.otpHint && OTP_HINT_ALLOWED) {
          toast.info("Dev verification code", {
            description: result.data.otpHint,
          });
        }
      } else {
        toast.error(result.error || "Couldn't send a code.", {
          description: "Please try again in a moment.",
        });
      }
    } finally {
      setSending(false);
    }
  }

  if (dismissed) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-sky/25 text-brand-navy">
          <MailCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-text-primary">Verify your email</p>
          <p className="mt-0.5 text-sm text-text-secondary">
            Confirm your email address to secure your account and receive
            important updates.
          </p>

          {showOtp ? (
            <div className="mt-4 max-w-sm">
              <OtpForm
                submitLabel="Verify email"
                onSubmit={async (otp) => {
                  const result = await emailVerifyConfirm(otp);
                  if (result.ok) {
                    toast.success("Email verified", {
                      description: "Thanks, your email is confirmed.",
                    });
                    onVerified();
                    setDismissed(true);
                  }
                  return result;
                }}
                onResend={async () => {
                  const result = await emailVerifyInitiate();
                  if (result.ok && result.data.otpHint && OTP_HINT_ALLOWED) {
                    toast.info("Dev verification code", {
                      description: result.data.otpHint,
                    });
                  }
                  return result;
                }}
              />
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              className="mt-3"
              onClick={startVerification}
              disabled={sending}
            >
              {sending ? "Sending code…" : "Verify email"}
            </Button>
          )}
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded-md p-1 text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
