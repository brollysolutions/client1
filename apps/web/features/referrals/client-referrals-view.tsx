"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/lib/format";
import { ReferralCodeCard } from "./referral-code-card";
import { ReferralList } from "./referral-list";
import { useReferrals } from "./use-referrals";

export function ClientReferralsView() {
  const { my, referrals, loading, error, reload } = useReferrals();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Referrals</h1>
        <p className="text-sm text-text-secondary">
          Your referral code, sharing tools, and conversion tracking.
        </p>
      </div>

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

          {my.eligible && my.stats.total > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatTile label="Referrals" value={String(my.stats.total)} />
              <StatTile label="Converted" value={String(my.stats.accrued + my.stats.paid)} />
              <StatTile label="Bonus accrued" value={formatPaise(my.stats.accrued_amount_paise)} />
              <StatTile label="Bonus paid" value={formatPaise(my.stats.paid_amount_paise)} />
            </div>
          ) : null}

          {my.eligible ? <ReferralList referrals={referrals} /> : null}
        </>
      )}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">{label}</p>
      <p className="mt-1 text-xl font-semibold text-text-primary">{value}</p>
    </div>
  );
}
