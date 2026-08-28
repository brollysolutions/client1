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

      {/* Operational load reads first: it is the standing state of the platform
          and frames the queue below it. Both panels run the full width of the
          shell — as a 1.35fr/1fr pair inside a 270px box, the queue could only
          ever show two or three of its rows. */}
      <DashboardPanel
        title="Operational load"
        description="Open work and finance queues"
        bodyClassName="p-0"
      >
        <dl className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4">
          <OperationalRow label="Open loan applications" value={home.open_loan_applications_count} href="/dashboard/loan-applications" />
          <OperationalRow label="Open property deals" value={home.open_property_deals_count} href="/dashboard/property-deals" />
          <OperationalRow label="Referral payouts due" value={home.referrals_awaiting_payout_count} href="/dashboard/referral-payouts" />
          <OperationalRow label="Pending agent applications" value={home.pending_agent_applications_count} href="/dashboard/agents" />
        </dl>
      </DashboardPanel>

      <DashboardPanel
        title="Waiting on you"
        description={
          pendingTotal > home.pending_review.length
            ? `Showing the ${home.pending_review.length} oldest of ${pendingTotal} items awaiting review`
            : "Review items across the platform, oldest first"
        }
        action={<PendingReviewDialog items={home.pending_review} total={pendingTotal} />}
        bodyClassName="p-0"
      >
        <PendingReviewList
          items={home.pending_review}
          emptyMessage="Approvals raised by agents, sub admins and property owners will appear here."
        />
      </DashboardPanel>

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

// One cell of the full-width load strip. The whole cell is the link, not just
// the number — at this size a bare numeral is a poor target, and the label is
// what the reader is aiming at anyway.
function OperationalRow({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <div className="sm:border-r sm:border-border sm:last:border-r-0">
      <Link
        href={href}
        className="group flex h-full flex-col justify-between gap-2 p-5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue"
      >
        <dt className="text-sm text-text-secondary transition-colors group-hover:text-text-primary">
          {label}
        </dt>
        <dd className="text-2xl font-semibold tabular-nums tracking-tight text-text-primary transition-colors group-hover:text-brand-cta">
          {value}
        </dd>
      </Link>
    </div>
  );
}
