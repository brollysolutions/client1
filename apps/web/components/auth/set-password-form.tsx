"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordField } from "@/components/auth/password-field";
import { cn } from "@/lib/utils";
import type { AuthResult } from "@/lib/auth";

// Minimum shown to the user; the maximum is enforced silently via the input's
// maxLength (never surfaced, per product decision).
const MIN = 8;
const MAX = 44;

// Live strength rules. `short` is the terse form used in the "Still needed" hint.
const RULES: { short: string; test: (v: string) => boolean }[] = [
  { short: "8+ characters", test: (v) => v.length >= MIN },
  { short: "an uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { short: "a lowercase letter", test: (v) => /[a-z]/.test(v) },
  { short: "a number", test: (v) => /[0-9]/.test(v) },
  { short: "a special character", test: (v) => /[^A-Za-z0-9]/.test(v) },
];

const SEGMENTS = 4;

// Shared "set a password" form (create + confirm) used by the final register
// step, the forgot-password reset step, and the forced first-login reset. Shows
// a live strength meter as the user types and an in-field match indicator; the
// form only enables submit once every rule passes and the two fields match.
export function SetPasswordForm({
  passwordLabel = "Create password",
  submitLabel,
  onSubmit,
}: {
  passwordLabel?: string;
  submitLabel: string;
  onSubmit: (password: string, confirm: string) => Promise<AuthResult<unknown>>;
}) {
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const metCount = RULES.reduce((n, r) => n + (r.test(password) ? 1 : 0), 0);
  const unmet = RULES.filter((r) => !r.test(password)).map((r) => r.short);
  const allRulesMet = metCount === RULES.length && password.length <= MAX;
  const matchOk = confirm.length > 0 && confirm === password;
  const canSubmit = allRulesMet && matchOk && !submitting;

  const ratio = metCount / RULES.length;
  const filled = password.length === 0 ? 0 : Math.max(1, Math.round(ratio * SEGMENTS));
  const tone = allRulesMet ? "success" : ratio >= 0.5 ? "blue" : "weak";
  const strengthLabel = allRulesMet
    ? "Strong"
    : ratio >= 0.8
      ? "Good"
      : ratio >= 0.4
        ? "Fair"
        : "Weak";

  const toneText =
    tone === "success"
      ? "text-success"
      : tone === "blue"
        ? "text-brand-blue"
        : "text-destructive";
  const toneBar =
    tone === "success"
      ? "bg-success"
      : tone === "blue"
        ? "bg-brand-blue"
        : "bg-destructive";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setServerError(null);
    const result = await onSubmit(password, confirm);
    if (!result.ok) {
      setSubmitting(false);
      setServerError(result.error || "Something went wrong. Please try again.");
    }
    // On success the parent handles the toast + navigation.
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password" className="text-[15px]">
          {passwordLabel}
        </Label>
        <PasswordField
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          placeholder="Enter your password"
          maxLength={MAX}
          aria-describedby="password-strength"
          disabled={submitting}
          className="h-12 rounded-lg text-base"
        />
        <div id="password-strength" className="min-h-[1.75rem] pt-1">
          {password.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex gap-1.5" aria-hidden="true">
                {Array.from({ length: SEGMENTS }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1.5 flex-1 rounded-full transition-colors",
                      i < filled ? toneBar : "bg-border",
                    )}
                  />
                ))}
              </div>
              <p className={cn("text-xs font-medium", toneText)}>
                {strengthLabel}
                {!allRulesMet && unmet.length > 0 && (
                  <span className="font-normal text-text-secondary">
                    {" · needs "}
                    {unmet.join(", ")}
                  </span>
                )}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-password" className="text-[15px]">
          Confirm password
        </Label>
        <PasswordField
          id="confirm-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          placeholder="Re-enter your password"
          maxLength={MAX}
          status={
            confirm.length === 0 ? undefined : matchOk ? "valid" : "invalid"
          }
          disabled={submitting}
          className="h-12 rounded-lg text-base"
        />
      </div>

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      <Button
        type="submit"
        size="lg"
        className="h-12 w-full text-base"
        disabled={!canSubmit}
      >
        {submitting ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
