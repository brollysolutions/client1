"use client";

import * as React from "react";
import { Clock } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
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
import { formatPaiseCompact } from "@/lib/format";
import { getSubAdminHome, type SubAdminHome as SubAdminHomeData } from "@/lib/sub-admin-api";
import { PendingApprovalDialog } from "./pending-approval-dialog";
import { PendingApprovalList } from "./pending-approval-list";

type Status = "loading" | "ready" | "error";

// Sub Admin's composed landing page (spec §6.1): pending-approval queue ->
// live banners/offers -> content drafts -> recent referral payouts, backed by
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
        description="Create content, monitor approval status, and manage cross-line promotions."
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
        <MetricCard label="Content drafts" value={home.content_drafts_count} icon={DASHBOARD_ICONS.websiteContent} href="/dashboard/content" />
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
      >
        {home.recent_referral_payouts.length === 0 ? (
          <p className="text-sm text-text-secondary">No referral payouts yet.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {home.recent_referral_payouts.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm"
              >
                <span className="capitalize text-text-secondary">{row.status}</span>
                <span className="font-medium tabular-nums text-text-primary">
                  {formatPaiseCompact(row.amount_paise)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DashboardPanel>

      <QuickActionGrid>
        <DashboardQuickAction href="/dashboard/banners" title="Banners" description="Create drafts and submit them for Admin approval." icon={DASHBOARD_ICONS.banners} />
        <DashboardQuickAction href="/dashboard/property-submit" title="Property listings" description="Submit a managed property listing for review." icon={DASHBOARD_ICONS.propertyListings} />
        <DashboardQuickAction href="/dashboard/offers" title="Offers" description="Create and schedule customer promotions." icon={DASHBOARD_ICONS.offers} />
        <DashboardQuickAction href="/dashboard/content" title="Website content" description="Write and publish approved public-site copy." icon={DASHBOARD_ICONS.websiteContent} />
        <DashboardQuickAction href="/dashboard/referral-rules" title="Referral bonus" description="Manage bonus rules and review payout activity." icon={DASHBOARD_ICONS.referrals} />
      </QuickActionGrid>
    </DashboardPage>
  );
}
