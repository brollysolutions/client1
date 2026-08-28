"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Loader2, WalletCards } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { Button } from "@/components/ui/button";
import { DASHBOARD_ICONS } from "@/features/dashboard/dashboard-icons";
import {
  DashboardHeader,
  DashboardPage,
  DashboardPanel,
  MetricCard,
  MetricGrid,
  QuickActionGrid,
  DashboardQuickAction,
} from "@/features/dashboard/dashboard-ui";
import { StatusBadge } from "@/features/dashboard/status-badge";
import { formatDate, formatPaise } from "@/lib/format";
import { listPayouts, type Payout } from "@/lib/payouts-api";

import { useReferralBonus } from "./use-referral-bonus";

const SETTLED = new Set(["paid", "reversed", "rejected", "failed"]);

export function FinanceOverview() {
  const { session } = useAuth();
  const canPreparePayouts = session?.staffFeatures.includes("payout_requests") ?? false;
  const { configs, activity, loading: rulesLoading } = useReferralBonus();
  const [payouts, setPayouts] = React.useState<Payout[]>([]);
  const [payoutsLoading, setPayoutsLoading] = React.useState(canPreparePayouts);

  React.useEffect(() => {
    if (!canPreparePayouts) {
      setPayouts([]);
      setPayoutsLoading(false);
      return;
    }
    let active = true;
    void listPayouts().then((response) => {
      if (!active) return;
      if (response.ok) setPayouts(response.data);
      setPayoutsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [canPreparePayouts]);

  const pending = payouts.filter((payout) => !SETTLED.has(payout.status));
  const recent = payouts.slice(0, 5);

  return (
    <DashboardPage>
      <DashboardHeader
        title="Finance"
        description="Manage future referral rules and track only the payout requests you prepared. Admin review and settlement remain separate."
      />

      <MetricGrid>
        <MetricCard
          label="Live referral rules"
          value={rulesLoading ? "—" : configs.filter((item) => item.active).length}
          hint={`${configs.length} configured`}
          icon={DASHBOARD_ICONS.referrals}
        />
        <MetricCard
          label="My open payout requests"
          value={payoutsLoading ? "—" : pending.length}
          hint={canPreparePayouts ? "Awaiting review or settlement" : "Delegation not enabled"}
          icon={DASHBOARD_ICONS.payouts}
        />
        <MetricCard
          label="My payout requests"
          value={payoutsLoading ? "—" : payouts.length}
          hint="Only requests raised by you"
          icon={DASHBOARD_ICONS.transactions}
        />
        <MetricCard
          label="Recent referral activity"
          value={rulesLoading ? "—" : activity.length}
          hint="Read-only programme activity"
          icon={DASHBOARD_ICONS.analytics}
        />
      </MetricGrid>

      <QuickActionGrid>
        <DashboardQuickAction
          href="/dashboard/referral-rules"
          title="Referral rules"
          description="Create, make live, retire, or delete an unused bonus rule."
          icon={DASHBOARD_ICONS.referrals}
        />
        {canPreparePayouts ? (
          <DashboardQuickAction
            href="/dashboard/payouts"
            title="Payout requests"
            description="Prepare a request and follow its Admin review and settlement state."
            icon={DASHBOARD_ICONS.payouts}
          />
        ) : null}
      </QuickActionGrid>

      <DashboardPanel
        title="My recent payout requests"
        description={
          canPreparePayouts
            ? "This is a maker-only view. Other staff requests and Admin-only controls are not exposed."
            : "The Main Admin can grant payout-request preparation when your role requires it."
        }
        action={
          canPreparePayouts ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/payouts">
                Open requests <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          ) : undefined
        }
      >
        {payoutsLoading ? (
          <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading payout requests…
          </div>
        ) : recent.length === 0 ? (
          <div className="flex min-h-32 flex-col items-center justify-center text-center">
            <WalletCards className="h-7 w-7 text-text-secondary" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-text-primary">No payout requests yet</p>
            <p className="mt-1 text-xs text-text-secondary">
              {canPreparePayouts
                ? "Prepared requests will appear here after you submit them."
                : "No delegated payout workspace is available for this account."}
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {recent.map((payout) => (
              <div
                key={payout.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4"
              >
                <div>
                  <p className="font-medium text-text-primary">
                    {payout.recipient_name ?? payout.recipient_code ?? "Recipient"}
                  </p>
                  <p className="mt-0.5 text-xs text-text-secondary">
                    {formatPaise(payout.amount_paise)} · {formatDate(payout.created_at)}
                  </p>
                </div>
                <StatusBadge tone={payout.status === "paid" ? "success" : payout.status === "rejected" || payout.status === "failed" ? "danger" : "warning"}>
                  {payout.status.replaceAll("_", " ")}
                </StatusBadge>
              </div>
            ))}
          </div>
        )}
      </DashboardPanel>
    </DashboardPage>
  );
}
