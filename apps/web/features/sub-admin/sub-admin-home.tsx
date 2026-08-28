"use client";

import * as React from "react";
import { Clock, IndianRupee } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, DataTablePrimaryCell } from "@/features/dashboard/data-table";
import { ListEmptyState } from "@/features/dashboard/list-states";
import { StatusBadge, type StatusTone } from "@/features/dashboard/status-badge";
import { FetchError } from "@/features/dashboard/fetch-error";
import { DASHBOARD_ICONS } from "@/features/dashboard/dashboard-icons";
import {
  DashboardHeader,
  DashboardPage,
  DashboardPanel,
  DashboardQuickAction,
  DashboardTextLink,
  MetricCard,
  MetricGrid,
  QuickActionGrid,
} from "@/features/dashboard/dashboard-ui";
import { formatDate, formatPaiseCompact } from "@/lib/format";
import { getSubAdminHome, type SubAdminHome as SubAdminHomeData } from "@/lib/sub-admin-api";
import { PendingApprovalDialog } from "./pending-approval-dialog";
import { PendingApprovalList } from "./pending-approval-list";

type Status = "loading" | "ready" | "error";

type ReferralPayoutRow = SubAdminHomeData["recent_referral_payouts"][number];

const PAYOUT_TONE: Record<string, StatusTone> = {
  paid: "success",
  processing: "info",
  pending: "warning",
  failed: "danger",
  reversed: "danger",
};

const LINE_LABEL: Record<string, string> = { loans: "Loans", real_estate: "Real Estate" };

const PAYOUT_COLUMNS = [
  {
    key: "description",
    header: "Payout",
    render: (row: ReferralPayoutRow) => (
      <DataTablePrimaryCell
        title={row.description || "Referral payout"}
        subtitle={LINE_LABEL[row.business_line] ?? row.business_line}
      />
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (row: ReferralPayoutRow) => (
      <StatusBadge tone={PAYOUT_TONE[row.status] ?? "neutral"}>
        {row.status.replaceAll("_", " ")}
      </StatusBadge>
    ),
  },
  {
    key: "created_at",
    header: "Raised",
    render: (row: ReferralPayoutRow) => (
      <span className="tabular-nums text-text-secondary">{formatDate(row.created_at)}</span>
    ),
  },
  {
    key: "amount_paise",
    header: "Amount",
    align: "right" as const,
    render: (row: ReferralPayoutRow) => (
      <span className="font-medium tabular-nums text-text-primary">
        {formatPaiseCompact(row.amount_paise)}
      </span>
    ),
  },
];

// Sub Admin's composed landing page (spec §6.1): pending-approval queue ->
// live banners/offers -> recent referral payouts, backed by
// one aggregated GET (services.sub_admin.get_sub_admin_home). Domain cards
// stay as the secondary navigation into each surface.
export function SubAdminHome() {
  const [home, setHome] = React.useState<SubAdminHomeData | null>(null);
  const [status, setStatus] = React.useState<Status>("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [errorStatus, setErrorStatus] = React.useState<number | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const retry = React.useCallback(() => {
    setStatus("loading");
    setError(null);
    setErrorStatus(null);
    setReloadKey((k) => k + 1);
  }, []);

  React.useEffect(() => {
    let active = true;
    const run = async () => {
      const res = await getSubAdminHome();
      if (!active) return;
      if (!res.ok) {
        setError(res.error);
        setErrorStatus(res.status);
        setStatus("error");
        return;
      }
      setHome(res.data);
      setStatus("ready");
    };
    void run();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  if (status === "loading") {
    return (
      <DashboardPage className="space-y-5">
        <Skeleton className="h-9 w-48 rounded-lg" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
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

  return (
    <DashboardPage>
      <DashboardHeader
        title="Sub Admin workspace"
        description="Monitor approval status and manage cross-line promotions."
        actions={<DashboardTextLink href="/dashboard/banners/new">Create banner</DashboardTextLink>}
      />

      <MetricGrid>
        <MetricCard
          label="Awaiting approval"
          value={home.pending_approval.length}
          icon={Clock}
          attention={home.pending_approval.length > 0}
        />
        <MetricCard label="Live banners" value={home.live_banners_count} icon={DASHBOARD_ICONS.banners} href="/dashboard/banners" />
        <MetricCard label="Active offers" value={home.live_offers_count} icon={DASHBOARD_ICONS.offers} href="/dashboard/offers" />
      </MetricGrid>

      {/* Full width, in DOM order, rather than a 1.4fr/1fr pair of 310px boxes:
          the approval queue could only ever show two or three rows there. */}
      <DashboardPanel
        title="Waiting on Admin"
        description="Work you have submitted that Admin has not decided yet"
        action={<PendingApprovalDialog items={home.pending_approval} />}
        bodyClassName="p-0"
      >
        <PendingApprovalList
          items={home.pending_approval}
          emptyMessage="Banners and property listings you submit for approval will appear here."
        />
      </DashboardPanel>

      <DashboardPanel
        title="Recent referral payouts"
        description="Latest activity under the configured rules"
        action={<DashboardTextLink href="/dashboard/referral-rules">View rules</DashboardTextLink>}
        bodyClassName="p-0"
      >
        {home.recent_referral_payouts.length === 0 ? (
          <ListEmptyState
            icon={IndianRupee}
            title="No referral payouts yet"
            description="Payouts raised under the configured bonus rules will appear here."
            className="m-5"
          />
        ) : (
          <DataTable
            columns={PAYOUT_COLUMNS}
            rows={home.recent_referral_payouts}
            rowKey={(row) => row.id}
            minWidth="min-w-[560px]"
          />
        )}
      </DashboardPanel>

      <QuickActionGrid>
        <DashboardQuickAction href="/dashboard/banners" title="Banners" description="Create drafts and submit them for Admin approval." icon={DASHBOARD_ICONS.banners} />
        <DashboardQuickAction href="/dashboard/property-submit" title="Property listings" description="Submit a managed property listing for review." icon={DASHBOARD_ICONS.propertyListings} />
        <DashboardQuickAction href="/dashboard/offers" title="Offers" description="Create and schedule customer promotions." icon={DASHBOARD_ICONS.offers} />
        <DashboardQuickAction href="/dashboard/referral-rules" title="Referral bonus" description="Manage bonus rules and review payout activity." icon={DASHBOARD_ICONS.referrals} />
      </QuickActionGrid>
    </DashboardPage>
  );
}
