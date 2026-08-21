"use client";

import Link from "next/link";
import { Clock } from "lucide-react";

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

import { PendingReviewDialog } from "./pending-review-dialog";
import { PendingReviewList } from "./pending-review-list";
import { STAFF_CAPACITY_HINT, STAFF_CAPACITY_HREF } from "./admin-capacity-routing";
import { useAdminHome } from "./use-admin-home";

export const ADMIN_FREQUENT_ACTIONS = [
  { href: "/dashboard/users", title: "Users and staff", description: "Provision staff and manage platform access.", icon: DASHBOARD_ICONS.usersAndStaff },
  { href: "/dashboard/agents", title: "Agent applications", description: "Review applications and agent status.", icon: DASHBOARD_ICONS.agentApplications },
  { href: "/dashboard/document-verification", title: "Document verification", description: "Review field and client-provided documents.", icon: DASHBOARD_ICONS.documentVerification },
  { href: "/dashboard/payouts", title: "Payouts", description: "Create, approve, and monitor payout workflows.", icon: DASHBOARD_ICONS.payouts },
  { href: "/dashboard/support-tickets", title: "Support tickets", description: "Triage account and access requests.", icon: DASHBOARD_ICONS.supportTickets },
  { href: "/dashboard/access-control", title: "Access control", description: "Manage supported field visibility by role.", icon: DASHBOARD_ICONS.accessControl },
  { href: "/dashboard/analytics", title: "Analytics", description: "Review line and agent performance reports.", icon: DASHBOARD_ICONS.analytics },
  { href: "/dashboard/loan-config", title: "Financial products", description: "Manage client forms and lender availability.", icon: DASHBOARD_ICONS.loanConfiguration },
  { href: "/dashboard/admin-leads", title: "Lead assignments", description: "Review lead ownership and assignment status.", icon: DASHBOARD_ICONS.leads },
] as const;

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
          label="Leads awaiting capacity"
          value={home.unassigned_leads_count}
          icon={DASHBOARD_ICONS.leads}
          href={STAFF_CAPACITY_HREF}
          hint={STAFF_CAPACITY_HINT}
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
        <DashboardPanel
          title="Waiting on you"
          description="Oldest review items across the platform"
          action={<PendingReviewDialog items={home.pending_review} total={pendingTotal} />}
          className="flex h-[270px] flex-col"
          bodyClassName="min-h-0 flex-1"
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <PendingReviewList
                items={home.pending_review}
                emptyMessage="Nothing is waiting on your approval right now."
              />
            </div>
            {pendingTotal > home.pending_review.length ? (
              <p className="mt-3 text-xs text-text-secondary">
                Showing {home.pending_review.length} of {pendingTotal} pending items.
              </p>
            ) : null}
          </div>
        </DashboardPanel>

        <DashboardPanel title="Operational load" description="Open work and finance queues" className="h-[270px]">
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
          {ADMIN_FREQUENT_ACTIONS.map((action) => (
            <DashboardQuickAction key={action.href} {...action} />
          ))}
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
