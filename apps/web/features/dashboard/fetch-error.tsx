"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { describeAuthError } from "@/lib/auth";

// Reusable error state for a failed data fetch. Prefers the status-specific copy
// (network / rate-limit / server fault) from describeAuthError so the message
// matches the real failure, and always offers a Retry rather than dead-ending.
export function FetchError({
  status,
  message,
  onRetry,
}: {
  status: number | null;
  message?: string | null;
  onRetry: () => void;
}) {
  const copy =
    (status !== null ? describeAuthError(status) : undefined) ??
    message ??
    "Something didn't work. Please try again.";

  return (
    <div className="rounded-xl border border-border bg-card p-8 text-center">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-muted text-text-secondary">
        <AlertTriangle className="h-5 w-5" />
      </span>
      <p className="mx-auto mt-4 max-w-sm text-sm text-text-secondary">{copy}</p>
      <Button variant="outline" size="sm" className="mt-5" onClick={onRetry}>
        <RefreshCw className="h-4 w-4" />
        Try again
      </Button>
    </div>
  );
}
