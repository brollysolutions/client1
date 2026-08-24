"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/lib/format";
import { DASHBOARD_ICONS } from "@/features/dashboard/dashboard-icons";
import { DashboardHeader, DashboardPage, DashboardPanel, MetricCard, MetricGrid } from "@/features/dashboard/dashboard-ui";
import { ReferralCodeCard } from "./referral-code-card";
import { ReferralList } from "./referral-list";
import { useReferrals } from "./use-referrals";

export function ClientReferralsView() {
  const { my, referrals, loading, error, reload } = useReferrals();

  return (
    <DashboardPage>
      <DashboardHeader
        title="Referrals"
        description="Share your personal code and track every eligible conversion and reward."
      />

      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : error || !my ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-text-secondary">{error ?? "Couldn't load your referrals."}</p>
          <Button variant="outline" className="mt-4" onClick={() => void reload()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          <ReferralCodeCard my={my} />

          {my.eligible ? (
            <MetricGrid>
              <MetricCard label="Referrals" value={my.stats.total} icon={DASHBOARD_ICONS.referrals} />
              <MetricCard label="Converted" value={my.stats.accrued + my.stats.paid} icon={DASHBOARD_ICONS.referrals} />
              <MetricCard label="Bonus accrued" value={formatPaise(my.stats.accrued_amount_paise)} icon={DASHBOARD_ICONS.earnings} />
              <MetricCard label="Bonus paid" value={formatPaise(my.stats.paid_amount_paise)} icon={DASHBOARD_ICONS.transactions} />
            </MetricGrid>
          ) : null}

          {my.eligible ? (
            <DashboardPanel title="Referral activity" description="Conversion and reward status for people who joined with your code.">
              <ReferralList referrals={referrals} embedded />
            </DashboardPanel>
          ) : null}
        </>
      )}
    </DashboardPage>
  );
}
