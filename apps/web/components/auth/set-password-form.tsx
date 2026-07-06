"use client";

import * as React from "react";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordField } from "@/components/auth/password-field";
import type { AuthResult } from "@/lib/auth";

// Shared "set a password" form (create + confirm) used by the final register
// step and the forgot-password reset step. Enforces the backend rule (8-128
// chars, must match) inline before calling onSubmit.
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
  const [errors, setErrors] = React.useState<{
    password?: string;
    confirm?: string;
  }>({});

  function validate() {
    const next: { password?: string; confirm?: string } = {};
    if (password.length < 8) next.password = "Use at least 8 characters.";
    else if (password.length > 128) next.password = "Password is too long.";
    if (confirm !== password) next.confirm = "Passwords do not match.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!validate()) return;

    setSubmitting(true);
    const result = await onSubmit(password, confirm);
    if (!result.ok) {
      setSubmitting(false);
      setErrors({ confirm: result.error || "Something went wrong. Please try again." });
    }
    // On success the parent handles the toast + navigation.
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="password">{passwordLabel}</Label>
        <PasswordField
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          placeholder="••••••••"
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? "password-error" : "password-hint"}
          disabled={submitting}
        />
        {errors.password ? (
          <p id="password-error" className="text-sm text-destructive">
            {errors.password}
          </p>
        ) : (
          <p id="password-hint" className="text-sm text-text-secondary">
            At least 8 characters
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirm password</Label>
        <PasswordField
          id="confirm-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          placeholder="••••••••"
          aria-invalid={!!errors.confirm}
          aria-describedby={errors.confirm ? "confirm-error" : undefined}
          disabled={submitting}
        />
        {errors.confirm && (
          <p id="confirm-error" className="text-sm text-destructive">
            {errors.confirm}
          </p>
        )}
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={submitting}>
        {submitting ? "Saving…" : submitLabel}
        {!submitting && <ArrowRight className="h-4 w-4" />}
      </Button>
    </form>
  );
}
