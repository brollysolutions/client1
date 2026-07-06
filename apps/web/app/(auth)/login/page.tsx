"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth/auth-shell";
import { MobileInput } from "@/components/auth/mobile-input";
import { PasswordField } from "@/components/auth/password-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { login, RESET_MOBILE_KEY } from "@/lib/auth";
import { isValidMobile, normalizeMobile, toE164 } from "@/lib/phone";

export default function LoginPage() {
  const router = useRouter();
  const [mobile, setMobile] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<{
    mobile?: string;
    password?: string;
  }>({});

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
      toast.success("Welcome back! You're logged in.");
      // TODO(auth): redirect to the role dashboard once sessions land.
      setSubmitting(false);
    } else {
      setSubmitting(false);
      toast.error(result.error || "Couldn't log you in. Please try again.");
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

  return (
    <AuthShell
      panelTitle="Welcome back."
      panelSubtitle="Log in with your phone number and password to pick up right where you left off."
    >
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text-primary focus-visible:text-text-primary focus-visible:outline-none"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to home
      </Link>

      <div className="space-y-2">
        <h1 className="font-heading text-3xl font-bold text-text-primary">
          Welcome back
        </h1>
        <p className="text-sm text-text-secondary">Log in to your account.</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="mobile">Phone number</Label>
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
          <Label htmlFor="password">Password</Label>
          <PasswordField
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "password-error" : undefined}
            disabled={submitting}
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
              className="text-sm font-medium text-brand-navy underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
            >
              Forgot password?
            </button>
          </div>
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? "Logging in…" : "Login"}
          {!submitting && <ArrowRight className="h-4 w-4" />}
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
