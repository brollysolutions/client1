"use client";

import * as React from "react";
import { BadgeCheck } from "lucide-react";

import { EmailVerifyBanner } from "@/components/auth/email-verify-banner";
import { useAuth } from "@/components/auth/session-provider";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FetchError } from "@/features/dashboard/fetch-error";
import { useMe } from "@/features/dashboard/me-provider";

export default function SettingsPage() {
  const { session } = useAuth();
  const { me, status, error, errorStatus, retry } = useMe();
  const [emailJustVerified, setEmailJustVerified] = React.useState(false);
  const emailVerified = me?.emailVerified ?? session?.emailVerified ?? false;
  const showEmailBanner = !emailVerified && !emailJustVerified;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Settings</h1>
        <p className="text-sm text-text-secondary">Your account details and preferences.</p>
      </div>

      {showEmailBanner && <EmailVerifyBanner onVerified={() => setEmailJustVerified(true)} />}

      {status === "loading" ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : status === "error" ? (
        <FetchError status={errorStatus} message={error} onRetry={retry} />
      ) : me ? (
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-sm font-medium text-text-secondary">Account</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                Name
              </dt>
              <dd className="mt-1 text-sm text-text-primary">
                {`${me.firstName} ${me.lastName}`.trim()}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                Mobile
              </dt>
              <dd className="mt-1 text-sm text-text-primary">{me.mobile}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                Email
              </dt>
              <dd className="mt-1 flex items-center gap-2 text-sm text-text-primary">
                <span className="truncate">{me.email}</span>
                {emailVerified && (
                  <Badge variant="secondary" className="gap-1 bg-success/10 text-success">
                    <BadgeCheck className="h-3 w-3" />
                    Verified
                  </Badge>
                )}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}
    </div>
  );
}
