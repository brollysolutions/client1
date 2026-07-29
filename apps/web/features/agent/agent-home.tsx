"use client";

import * as React from "react";
import Link from "next/link";
import { IndianRupee, PhoneCall, UserRound } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { FetchError } from "@/features/dashboard/fetch-error";
import { formatPaise } from "@/lib/format";

import { useAgentEarnings } from "./use-agent-earnings";
import { useAgentHome } from "./use-agent-home";

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  assigned: "Assigned",
  working: "Working",
  converted: "Converted",
  closed: "Closed",
  released: "Released",
};

const PROFILE_STATUS_LABEL: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  pending: "Pending",
  suspended: "Suspended",
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// Agent landing page: registration status card, lead-funnel counts, and an
// "Introduce a lead" entry point. Mirrors TelecallerHome's minimal-landing
// posture — this slice ships the lead-sourcing flow only.
export function AgentHome() {
  const { home, status, error, errorStatus, retry } = useAgentHome();
  const { earnings, status: earningsStatus, retry: retryEarnings } = useAgentEarnings();

  if (status === "loading") {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-5 px-4 sm:px-6 lg:px-10">
        <Skeleton className="h-9 w-48 rounded-lg" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (status === "error" || !home) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-10">
        <FetchError status={errorStatus} message={error} onRetry={retry} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Home</h1>
          <p className="mt-1 text-sm text-text-secondary">Your introduced leads, at a glance.</p>
        </div>
        <Link
          href="/dashboard/leads/new"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-cta px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-cta/90"
        >
          <PhoneCall className="h-4 w-4" aria-hidden="true" />
          Introduce a lead
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-text-primary">Your leads</h2>
          {Object.keys(home.counts_by_status).length === 0 ? (
            <p className="mt-3 text-sm text-text-secondary">No leads introduced yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {Object.entries(home.counts_by_status).map(([key, count]) => (
                <li key={key} className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">{STATUS_LABEL[key] ?? key}</span>
                  <span className="font-medium text-text-primary">{count}</span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/dashboard/leads"
            className="mt-4 inline-block text-sm font-medium text-brand-cta hover:underline"
          >
            View all leads
          </Link>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <UserRound className="h-4 w-4 text-text-secondary" aria-hidden="true" />
            Registration status
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-text-secondary">Agent code</dt>
              <dd className="font-medium text-text-primary">{home.profile.agent_code}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-text-secondary">Status</dt>
              <dd className="font-medium text-text-primary">
                {PROFILE_STATUS_LABEL[home.profile.status] ?? home.profile.status}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-text-secondary">KYC status</dt>
              <dd className="font-medium text-text-primary">{home.profile.kyc_status ?? "-"}</dd>
            </div>
            {home.profile.business_line === "real_estate" ? (
              <div className="flex items-center justify-between">
                <dt className="text-text-secondary">RERA code</dt>
                <dd className="font-medium text-text-primary">{home.profile.rera_code ?? "-"}</dd>
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <dt className="text-text-secondary">Approved on</dt>
              <dd className="font-medium text-text-primary">{formatDate(home.profile.approved_at)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <IndianRupee className="h-4 w-4 text-text-secondary" aria-hidden="true" />
            Commission summary
          </h2>
          {earningsStatus === "loading" ? (
            <Skeleton className="mt-3 h-16 rounded-lg" />
          ) : earningsStatus === "error" ? (
            <div className="mt-3 flex items-center justify-between gap-2 text-sm">
              <p className="text-text-secondary">Couldn&apos;t load your earnings.</p>
              <button
                type="button"
                onClick={retryEarnings}
                className="font-medium text-brand-cta hover:underline"
              >
                Retry
              </button>
            </div>
          ) : earnings && earnings.rows.length > 0 ? (
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-text-secondary">Pending</dt>
                <dd className="font-medium text-text-primary">
                  {formatPaise(earnings.totals.pending_amount_paise)}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-text-secondary">Paid</dt>
                <dd className="font-medium text-text-primary">
                  {formatPaise(earnings.totals.paid_amount_paise)}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-text-secondary">No commissions recorded yet.</p>
          )}
          <Link
            href="/dashboard/earnings"
            className="mt-4 inline-block text-sm font-medium text-brand-cta hover:underline"
          >
            View earnings
          </Link>
        </div>
      </div>
    </div>
  );
}
