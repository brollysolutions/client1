"use client";

import * as React from "react";
import { Check, Copy, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

// Shown once right after a create/approve response carries a temp_password.
// The backend never returns it again, so this is the only place it's visible.
export function TempCredentialPanel({
  mobile,
  tempPassword,
}: {
  mobile: string;
  tempPassword: string;
}) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the password is still selectable/readable below */
    }
  }

  return (
    <div className="rounded-xl border border-brand-cta/30 bg-brand-cta/5 p-4">
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-brand-cta" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary">Shown once. Share it securely.</p>
          <p className="mt-1 text-xs text-text-secondary">
            This password will not be shown again. Share it with {mobile} out of band; they will be
            forced to set a new password on first login.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono text-text-primary">
              {tempPassword}
            </code>
            <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
