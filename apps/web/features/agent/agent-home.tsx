"use client";

import * as React from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { DASHBOARD_ICONS } from "@/features/dashboard/dashboard-icons";
import {
  DashboardHeader,
  DashboardPage,
  DashboardPanel,
  DashboardTextLink,
  MetricCard,
  MetricGrid,
} from "@/features/dashboard/dashboard-ui";
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
  expired: "Expired",
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
      <DashboardPage className="space-y-5">
        <Skeleton className="h-9 w-48 rounded-lg" />
        <Skeleton className="h-64 rounded-2xl" />
      </DashboardPage>
    );
  }

  if (status === "error" || !home) {
    return (
      <DashboardPage>
        <FetchError status={errorStatus} message={error} onRetry={retry} />
      </DashboardPage>
    );
  }

  const totalLeads = Object.values(home.counts_by_status).reduce((sum, count) => sum + count, 0);
  const paidAmount = earnings ? formatPaise(earnings.totals.paid_amount_paise) : "-";

  return (
    <DashboardPage>
      <DashboardHeader
        eyebrow={home.profile.business_line === "real_estate" ? "Real Estate partner" : "Loans partner"}
        title="Agent workspace"
        description="Monitor introduced leads, registration standing, and commission progress."
        actions={
        <Link
          href="/dashboard/leads/new"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-cta px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-cta/90"
        >
          <DASHBOARD_ICONS.leads className="h-4 w-4" aria-hidden="true" />
          Introduce a lead
        </Link>
        }
      />

      <MetricGrid>
        <MetricCard label="Introduced leads" value={totalLeads} icon={DASHBOARD_ICONS.leads} href="/dashboard/leads" />
        <MetricCard label="Working" value={home.counts_by_status.working ?? 0} icon={DASHBOARD_ICONS.leads} href="/dashboard/leads" />
        <MetricCard label="Converted" value={home.counts_by_status.converted ?? 0} icon={DASHBOARD_ICONS.leads} href="/dashboard/leads" />
        <MetricCard label="Commission paid" value={paidAmount} icon={DASHBOARD_ICONS.earnings} href="/dashboard/earnings" />
      </MetricGrid>

      <div className="grid gap-4 xl:grid-cols-3">
        <DashboardPanel
          title="Lead distribution"
          description="Introduced leads by current status"
          action={<DashboardTextLink href="/dashboard/leads">View leads</DashboardTextLink>}
        >
          {Object.keys(home.counts_by_status).length === 0 ? (
            <p className="text-sm text-text-secondary">No leads introduced yet.</p>
          ) : (
            <ul className="space-y-2">
              {Object.entries(home.counts_by_status).map(([key, count]) => (
                <li key={key} className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">{STATUS_LABEL[key] ?? key}</span>
                  <span className="font-medium text-text-primary">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </DashboardPanel>

        <DashboardPanel title="Registration status" description="Your approved partner profile">
          <dl className="space-y-2 text-sm">
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
        </DashboardPanel>

        <DashboardPanel
          title="Commission summary"
          description="Negotiated earnings by payout state"
          action={<DashboardTextLink href="/dashboard/earnings">View earnings</DashboardTextLink>}
        >
          {earningsStatus === "loading" ? (
            <Skeleton className="h-16 rounded-lg" />
          ) : earningsStatus === "error" ? (
            <div className="flex items-center justify-between gap-2 text-sm">
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
            <dl className="space-y-2 text-sm">
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
            <p className="text-sm text-text-secondary">No commissions recorded yet.</p>
          )}
        </DashboardPanel>
      </div>
    </DashboardPage>
  );
}
