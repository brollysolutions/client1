"use client";

import Link from "next/link";
import { Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DASHBOARD_ICONS } from "@/features/dashboard/dashboard-icons";
import {
  DashboardHeader,
  DashboardPage,
  DashboardPanel,
  DashboardQuickAction,
  DashboardSection,
  DashboardTextLink,
  MetricCard,
  MetricGrid,
  QuickActionGrid,
} from "@/features/dashboard/dashboard-ui";
import { FetchError } from "@/features/dashboard/fetch-error";

import { useAdminHome } from "./use-admin-home";

const KIND_LABEL: Record<string, string> = {
  agent_application: "Agent application",
  banner: "Banner",
  property_submission: "Property listing",
};

const KIND_HREF: Record<string, string> = {
  agent_application: "/dashboard/agents",
  banner: "/dashboard/banners",
  property_submission: "/dashboard/property-review",
};

const LINE_LABEL: Record<string, string> = {
  loans: "Loans",
  real_estate: "Real Estate",
  both: "Both lines",
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// Cross-line operational overview. The sidebar owns exhaustive navigation;
// this page surfaces only work requiring attention, current load, and the most
// frequent administrative entry points.
export function AdminHome() {
  const { home, status, error, errorStatus, retry } = useAdminHome();

  if (status === "loading") {
    return (
      <DashboardPage className="space-y-5">
        <Skeleton className="h-9 w-48 rounded-lg" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
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

  const pendingTotal =
    home.pending_agent_applications_count +
    home.pending_banners_count +
    home.pending_property_submissions_count;

  return (
    <DashboardPage>
      <DashboardHeader
        eyebrow="Platform operations"
        title="Admin overview"
        description="Review approvals, resolve assignment gaps, and monitor both business lines."
        actions={<DashboardTextLink href="/dashboard/analytics">Open analytics</DashboardTextLink>}
      />

      <MetricGrid>
        <MetricCard
          label="Pending approvals"
          value={pendingTotal}
          icon={Clock}
          attention={pendingTotal > 0}
        />
        <MetricCard
          label="Unassigned leads"
          value={home.unassigned_leads_count}
          icon={DASHBOARD_ICONS.leads}
          href="/dashboard/admin-leads"
          attention={home.unassigned_leads_count > 0}
        />
        <MetricCard
          label="Unassigned tasks"
          value={home.unassigned_tasks_count}
          icon={DASHBOARD_ICONS.tasks}
          href="/dashboard/admin-tasks"
          attention={home.unassigned_tasks_count > 0}
        />
        <MetricCard
          label="Payouts awaiting approval"
          value={home.payouts_awaiting_approval_count}
          icon={DASHBOARD_ICONS.payouts}
          href="/dashboard/payouts"
          attention={home.payouts_awaiting_approval_count > 0}
        />
      </MetricGrid>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <DashboardPanel title="Waiting on you" description="Oldest review items across the platform">
          {home.pending_review.length === 0 ? (
            <p className="text-sm text-text-secondary">
              Nothing is waiting on your approval right now.
            </p>
          ) : (
            <>
              <ul className="space-y-2">
                {home.pending_review.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={KIND_HREF[item.kind] ?? "/dashboard"}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm transition-colors hover:border-brand-cta"
                    >
                      <span className="flex min-w-0 items-center gap-2 font-medium text-text-primary">
                        <Clock className="h-4 w-4 shrink-0 text-brand-cta" aria-hidden="true" />
                        <span className="truncate">{item.title}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-text-secondary">
                        <Badge variant="outline">{KIND_LABEL[item.kind] ?? item.kind}</Badge>
                        {LINE_LABEL[item.business_line] ?? item.business_line}
                        {formatDate(item.submitted_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {pendingTotal > home.pending_review.length ? (
                <p className="mt-3 text-xs text-text-secondary">
                  Showing {home.pending_review.length} of {pendingTotal} pending items.
                </p>
              ) : null}
            </>
          )}
        </DashboardPanel>

        <DashboardPanel title="Operational load" description="Open work and finance queues">
          <dl className="divide-y divide-border text-sm">
            <OperationalRow label="Open loan applications" value={home.open_loan_applications_count} href="/dashboard/loan-applications" />
            <OperationalRow label="Open property deals" value={home.open_property_deals_count} href="/dashboard/property-deals" />
            <OperationalRow label="Referral payouts due" value={home.referrals_awaiting_payout_count} href="/dashboard/referral-payouts" />
            <OperationalRow label="Pending agent applications" value={home.pending_agent_applications_count} href="/dashboard/agents" />
          </dl>
        </DashboardPanel>
      </div>

      <DashboardSection
        title="Frequent actions"
        description="The most common administrative destinations; every other capability remains in the sidebar."
      >
        <QuickActionGrid>
          <DashboardQuickAction href="/dashboard/users" title="Users and staff" description="Provision staff and manage platform access." icon={DASHBOARD_ICONS.usersAndStaff} />
          <DashboardQuickAction href="/dashboard/agents" title="Agent applications" description="Review applications and agent status." icon={DASHBOARD_ICONS.agentApplications} />
          <DashboardQuickAction href="/dashboard/document-verification" title="Document verification" description="Review field and client-provided documents." icon={DASHBOARD_ICONS.documentVerification} />
          <DashboardQuickAction href="/dashboard/payouts" title="Payouts" description="Create, approve, and monitor payout workflows." icon={DASHBOARD_ICONS.payouts} />
          <DashboardQuickAction href="/dashboard/support-tickets" title="Support tickets" description="Triage account and access requests." icon={DASHBOARD_ICONS.supportTickets} />
          <DashboardQuickAction href="/dashboard/access-control" title="Access control" description="Manage supported field visibility by role." icon={DASHBOARD_ICONS.accessControl} />
          <DashboardQuickAction href="/dashboard/analytics" title="Analytics" description="Review line and agent performance reports." icon={DASHBOARD_ICONS.analytics} />
          <DashboardQuickAction href="/dashboard/loan-config" title="Loan configuration" description="Manage loan types and bank availability." icon={DASHBOARD_ICONS.loanConfiguration} />
          <DashboardQuickAction href="/dashboard/audit-log" title="Audit log" description="Inspect recorded platform actions." icon={DASHBOARD_ICONS.auditLog} />
        </QuickActionGrid>
      </DashboardSection>
    </DashboardPage>
  );
}

function OperationalRow({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <dt className="text-text-secondary">{label}</dt>
      <dd>
        <Link href={href} className="font-semibold text-brand-cta hover:underline">
          {value}
        </Link>
      </dd>
    </div>
  );
}
