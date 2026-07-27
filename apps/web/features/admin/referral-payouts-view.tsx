"use client";

import * as React from "react";
import { Gift, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LINE_LABEL, STATUS_LABEL, STATUS_STYLE } from "@/features/referrals/referral-list";
import { formatPaise } from "@/lib/format";

import { ReferralPayoutDialog } from "./referral-payout-dialog";
import { useReferralPayouts } from "./use-referral-payouts";
import type { AdminReferral } from "@/lib/admin-referrals-api";

const ACCRUAL_REASON_LABEL: Record<string, string> = {
  no_active_config: "No active bonus rule for this line",
  below_min_conversion: "Below the rule's minimum conversion count",
  cap_reached: "Referrer's payout cap already reached",
  referrer_not_client: "Referrer is no longer a client",
  self_referral: "Self-referral",
};

const FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "accrued", label: "Awaiting payout" },
  { value: "paid", label: "Paid" },
  { value: "converted", label: "Converted, no bonus" },
  { value: "void", label: "Not eligible" },
  { value: "pending", label: "Pending" },
  { value: "", label: "All" },
];

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function ReferralPayoutsView() {
  const { items, loading, error, statusFilter, setStatusFilter, reload, payBonus } =
    useReferralPayouts();
  const [active, setActive] = React.useState<AdminReferral | null>(null);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Referral payouts</h1>
          <p className="text-sm text-text-secondary">
            Pay an accrued referral bonus, or see why a converted referral never accrued one.
          </p>
        </div>
        <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Awaiting payout" />
          </SelectTrigger>
          <SelectContent>
            {FILTER_OPTIONS.map((o) => (
              <SelectItem key={o.value || "all"} value={o.value || "all"}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-border bg-card py-16">
          <Loader2 className="h-6 w-6 animate-spin text-brand-navy" aria-hidden="true" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-text-secondary">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => void reload()}>
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-12 text-center">
          <Gift className="h-8 w-8 text-text-secondary" aria-hidden="true" />
          <p className="mt-3 font-medium text-text-primary">
            {statusFilter === "accrued"
              ? "No referral bonuses are waiting to be paid."
              : "No referrals match this filter."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((r) => {
            // reward_payout_uuid set but conversion_status still "accrued" is
            // the real state between "Pay bonus" raising a payout and that
            // payout being approved — approval is what flips it to "paid".
            // Checking status alone left the button live and re-clickable
            // for that whole window (a real bug caught in review): the
            // second click's create would 409 on the referral being claimed,
            // but a confused admin has no way to tell it already worked.
            const awaitingApproval =
              r.conversion_status === "accrued" && r.reward_payout_uuid != null;
            const payable = r.conversion_status === "accrued" && r.reward_payout_uuid == null;
            const card = (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-text-primary">
                      {r.bonus_amount_paise != null ? formatPaise(r.bonus_amount_paise) : "-"}
                    </span>
                    <Badge className={STATUS_STYLE[r.conversion_status] ?? "bg-muted text-text-secondary"}>
                      {STATUS_LABEL[r.conversion_status] ?? r.conversion_status}
                    </Badge>
                  </div>
                  <p className="truncate text-sm text-text-secondary">
                    {r.referrer_name ?? "Unknown referrer"}
                    {r.referrer_code ? ` · ${r.referrer_code}` : ""}
                  </p>
                  <p className="truncate text-xs text-text-secondary">
                    Referred {r.referred_mobile_masked}
                    {r.business_line ? ` · ${LINE_LABEL[r.business_line] ?? r.business_line}` : ""}
                    {" · "}
                    {formatDate(r.converted_at ?? r.created_at)}
                  </p>
                  {r.accrual_reason && r.accrual_reason !== "accrued" ? (
                    <p className="truncate text-xs text-text-secondary">
                      {ACCRUAL_REASON_LABEL[r.accrual_reason] ?? r.accrual_reason}
                    </p>
                  ) : null}
                </div>
                {payable ? (
                  <Button size="sm" onClick={() => setActive(r)}>
                    Pay bonus
                  </Button>
                ) : awaitingApproval ? (
                  <Badge className="bg-warning/10 text-warning">Payout raised</Badge>
                ) : null}
              </div>
            );
            return <li key={r.id}>{card}</li>;
          })}
        </ul>
      )}

      <ReferralPayoutDialog
        referral={active}
        onOpenChange={(open) => !open && setActive(null)}
        onPay={payBonus}
      />
    </div>
  );
}
