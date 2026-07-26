"use client";

import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";

import { usePushSubscription } from "./use-push-subscription";

// Visual shell modeled on components/auth/email-verify-banner.tsx, but this
// is a persistent settings toggle reflecting current state, not a
// dismissible one-shot nag — no X button.
export function PushSubscriptionCard() {
  const { status, subscribe, unsubscribe } = usePushSubscription();

  // Nothing actionable: browser can't do push, or the backend has no VAPID
  // key configured yet (mock mode) so a subscription could never deliver.
  if (status === "checking" || status === "unsupported" || status === "unconfigured") {
    return null;
  }

  const isSubscribed = status === "subscribed" || status === "unsubscribing";
  const isBusy = status === "subscribing" || status === "unsubscribing";

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-sky/25 text-brand-navy">
          <Bell className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-text-primary">Push notifications</p>
          <p className="mt-0.5 text-sm text-text-secondary">
            {status === "denied"
              ? "Notifications are blocked in your browser settings. Allow them for this site to turn this on."
              : "Get a browser notification for status changes, assignments, and other updates as they happen."}
          </p>

          {status !== "denied" && (
            <Button
              type="button"
              size="sm"
              variant={isSubscribed ? "outline" : "default"}
              className="mt-3"
              onClick={isSubscribed ? unsubscribe : subscribe}
              disabled={isBusy}
            >
              {status === "subscribing"
                ? "Enabling…"
                : status === "unsubscribing"
                  ? "Disabling…"
                  : isSubscribed
                    ? "Disable notifications"
                    : "Enable notifications"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
