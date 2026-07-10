"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth/auth-shell";
import { MobileInput } from "@/components/auth/mobile-input";
import { PasswordField } from "@/components/auth/password-field";
import { SetPasswordForm } from "@/components/auth/set-password-form";
import { useAuth } from "@/components/auth/session-provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  changePassword,
  describeAuthError,
  login,
  RESET_MOBILE_KEY,
} from "@/lib/auth";
import { isValidMobile, normalizeMobile, toE164 } from "@/lib/phone";

export default function LoginPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [mobile, setMobile] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<{
    mobile?: string;
    password?: string;
  }>({});
  // A provisioned account that logs in with a temporary password must set a new
  // one before continuing. We deliberately do NOT open an app session yet (that
  // would let the guard wave them through to /dashboard and a reload would drop
  // the force_reset claim). Instead we hold the temporary password + the
  // force-reset access token locally, drive change-password with them, then log
  // in fresh so the session carries a clean token.
  const [forceReset, setForceReset] = React.useState(false);
  const currentPasswordRef = React.useRef("");
  const forcedTokenRef = React.useRef("");

  function validate() {
    const next: { mobile?: string; password?: string } = {};
    if (!isValidMobile(mobile))
      next.mobile = "Enter a valid 10-digit mobile number.";
    if (!password) next.password = "Please enter your password.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!validate()) return;

    setSubmitting(true);
    const result = await login(toE164(mobile), password);

    if (result.ok) {
      if (result.data.forceReset) {
        // Hold the temp password + token locally; stay unauthenticated until the
        // reset is done so the guard can't be bypassed by reload/navigation.
        currentPasswordRef.current = password;
        forcedTokenRef.current = result.data.accessToken;
        setSubmitting(false);
        setForceReset(true);
        return;
      }
      setSession(result.data);
      toast.success("Welcome back!", {
        description: "You're logged in. Taking you to your dashboard.",
      });
      router.replace("/dashboard");
    } else {
      setSubmitting(false);
      toast.error(result.error || "Couldn't log you in.", {
        description:
          describeAuthError(result.status) ??
          "Please check your details and try again.",
      });
    }
  }

  // Reuse the number already typed here to reset the password — don't make the
  // user re-enter it on the next screen. Requires a valid number first; the
  // handoff rides sessionStorage (see RESET_MOBILE_KEY) to keep PII out of the URL.
  function handleForgotPassword() {
    if (!isValidMobile(mobile)) {
      setErrors((prev) => ({
        ...prev,
        mobile: "Enter your mobile number first.",
      }));
      return;
    }
    sessionStorage.setItem(RESET_MOBILE_KEY, normalizeMobile(mobile));
    router.push("/forgot-password");
  }

  if (forceReset) {
    return (
      <AuthShell
        panelTitle="One quick step."
        panelSubtitle="Your account uses a temporary password. Set a new one to finish signing in."
      >
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-sky/25 text-brand-navy">
          <Lock className="h-6 w-6" />
        </span>

        <div className="mb-5 space-y-2">
          <h1 className="font-heading text-3xl font-bold text-text-primary">
            Set a new password
          </h1>
          <p className="text-base text-text-secondary">
            Choose a new password to secure your account.
          </p>
        </div>

        <SetPasswordForm
          passwordLabel="New password"
          submitLabel="Save and continue"
          mobile={mobile}
          onSubmit={async (newPassword, confirm) => {
            const result = await changePassword(
              currentPasswordRef.current,
              newPassword,
              confirm,
              forcedTokenRef.current,
            );
            if (!result.ok) {
              // The force-reset token is short-lived and never auto-refreshed
              // (explicit bearer). If it lapsed mid-form the backend returns a
              // bare 401 "Unauthorized.", so replace that developer string with a
              // friendly line and send the user back to log in fresh (audit L8).
              if (result.status === 401) {
                currentPasswordRef.current = "";
                forcedTokenRef.current = "";
                setForceReset(false);
                toast.error("Your reset session expired.", {
                  description: "Please log in again to continue.",
                });
                router.replace("/login");
                return { ok: false, error: "Your reset session expired.", status: 401 };
              }
              return result;
            }

            // Reset done: log in fresh with the new password so the session
            // holds a clean token (no lingering force_reset claim).
            const relog = await login(toE164(mobile), newPassword);
            currentPasswordRef.current = "";
            forcedTokenRef.current = "";
            if (relog.ok) {
              setSession(relog.data);
              toast.success("Password updated", {
                description: "You're all set. Signing you in now.",
              });
              router.replace("/dashboard");
            } else {
              toast.success("Password updated", {
                description: "Please log in with your new password.",
              });
              setForceReset(false);
            }
            return result;
          }}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      panelTitle="Welcome back."
      panelSubtitle="Log in with your phone number and password to pick up right where you left off."
    >
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text-primary focus-visible:text-text-primary focus-visible:outline-none"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to home
      </Link>

      <div className="space-y-2">
        <h1 className="font-heading text-3xl font-bold text-text-primary">
          Welcome back
        </h1>
        <p className="text-base text-text-secondary">Log in to your account.</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="mobile" className="text-[15px]">
            Phone number
          </Label>
          <MobileInput
            id="mobile"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
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
          <Label htmlFor="password" className="text-[15px]">
            Password
          </Label>
          <PasswordField
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="Enter your password"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "password-error" : undefined}
            disabled={submitting}
            className="h-12 rounded-lg text-base"
          />
          {errors.password && (
            <p id="password-error" className="text-sm text-destructive">
              {errors.password}
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={submitting}
              className="cursor-pointer text-sm font-medium text-brand-navy underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
            >
              Forgot password?
            </button>
          </div>
        </div>

        <Button
          type="submit"
          size="lg"
          className="h-12 w-full text-base"
          disabled={submitting}
        >
          {submitting ? "Logging in…" : "Login"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-text-secondary">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="font-medium text-brand-navy underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
        >
          Sign up
        </Link>
      </p>
    </AuthShell>
  );
}
