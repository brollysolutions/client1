"use client";

import * as React from "react";
import { Gift } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DashboardHeader, DashboardPage } from "@/features/dashboard/dashboard-ui";
import { DataTablePrimaryCell, type DataColumn } from "@/features/dashboard/data-table";
import { StatusBadge, type StatusTone } from "@/features/dashboard/status-badge";
import type { AdminReferral } from "@/lib/admin-referrals-api";
import { formatDate, formatPaise } from "@/lib/format";
import { getMoneyPayoutRequestState } from "@/lib/money-ledger";
import { MoneyLedgerView, type MoneyLedgerSection } from "./money-ledger-view";
import { ReferralPayoutDialog } from "./referral-payout-dialog";
import { useReferralPayouts } from "./use-referral-payouts";

const LINE_LABEL: Record<string, string> = {
  loans: "Loans",
  real_estate: "Real Estate",
  both: "Both lines",
};
const STATUS_OPTIONS = [
  { value: "accrued", label: "Awaiting payout" },
  { value: "paid", label: "Paid" },
  { value: "converted", label: "Converted, no bonus" },
  { value: "void", label: "Not eligible" },
  { value: "pending", label: "Pending" },
] as const;
const STATUS_META: Record<string, { label: string; tone: StatusTone }> = {
  pending: { label: "Pending", tone: "warning" },
  converted: { label: "Converted", tone: "neutral" },
  accrued: { label: "Bonus accrued", tone: "success" },
  paid: { label: "Paid", tone: "success" },
  void: { label: "Not eligible", tone: "danger" },
};
const ACCRUAL_REASON_LABEL: Record<string, string> = {
  no_active_config: "No active bonus rule for this line",
  below_min_conversion: "Below the rule's minimum conversion count",
  cap_reached: "Referrer's payout cap already reached",
  referrer_not_client: "Referrer is no longer a client",
  self_referral: "Self-referral",
};

export function ReferralPayoutsView() {
  const { items, loading, error, statusFilter, setStatusFilter, reload, payBonus } =
    useReferralPayouts();
  const [active, setActive] = React.useState<AdminReferral | null>(null);

  const columns = React.useMemo<readonly DataColumn<AdminReferral>[]>(
    () => [
      {
        key: "referrer",
        header: "Referrer",
        render: (referral) => (
          <DataTablePrimaryCell
            title={referral.referrer_name ?? "Unknown referrer"}
            subtitle={referral.referrer_code ?? "No referral code"}
          />
        ),
      },
      {
        key: "referred",
        header: "Referred mobile",
        render: (referral) => referral.referred_mobile_masked,
      },
      {
        key: "line",
        header: "Line",
        render: (referral) =>
          referral.business_line
            ? (LINE_LABEL[referral.business_line] ?? referral.business_line)
            : "-",
      },
      {
        key: "amount",
        header: "Bonus",
        align: "right",
        render: (referral) => (
          <span className="font-medium tabular-nums">
            {referral.bonus_amount_paise == null ? "-" : formatPaise(referral.bonus_amount_paise)}
          </span>
        ),
      },
      {
        key: "date",
        header: "Converted",
        render: (referral) => formatDate(referral.converted_at ?? referral.created_at),
      },
      {
        key: "state",
        header: "State",
        render: (referral) => {
          const payoutState = getMoneyPayoutRequestState({
            status: referral.conversion_status,
            payableStatus: "accrued",
            payoutId: referral.reward_payout_uuid,
          });
          if (payoutState === "awaiting_approval") {
            return <StatusBadge tone="warning">Payout raised</StatusBadge>;
          }
          const meta = STATUS_META[referral.conversion_status] ?? {
            label: referral.conversion_status,
            tone: "neutral" as const,
          };
          const reason = referral.accrual_reason
            ? ACCRUAL_REASON_LABEL[referral.accrual_reason] ?? referral.accrual_reason
            : null;
          return (
            <div className="space-y-1">
              <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
              {reason && referral.accrual_reason !== "accrued" ? (
                <p className="max-w-64 truncate text-xs text-text-secondary">{reason}</p>
              ) : null}
            </div>
          );
        },
      },
      {
        key: "action",
        header: "Action",
        align: "right",
        render: (referral) =>
          getMoneyPayoutRequestState({
            status: referral.conversion_status,
            payableStatus: "accrued",
            payoutId: referral.reward_payout_uuid,
          }) === "payable" ? (
            <Button size="sm" onClick={() => setActive(referral)}>
              Pay bonus
            </Button>
          ) : null,
      },
    ],
    [],
  );

  const ledger: MoneyLedgerSection<AdminReferral> = {
    title: "Referral payout ledger",
    description: "Accrued bonuses, in-flight approvals, paid rewards, and ineligibility reasons.",
    rows: items,
    columns,
    rowKey: (referral) => referral.id,
    searchText: (referral) =>
      `${referral.referrer_name ?? ""} ${referral.referrer_code ?? ""} ${referral.referred_mobile_masked} ${
        referral.accrual_reason ? ACCRUAL_REASON_LABEL[referral.accrual_reason] ?? referral.accrual_reason : ""
      }`,
    status: (referral) => referral.conversion_status,
    line: (referral) => referral.business_line,
    date: (referral) => referral.converted_at ?? referral.created_at,
    statusOptions: STATUS_OPTIONS,
    statusLabel: "referral states",
    initialStatus: statusFilter,
    onStatusChange: setStatusFilter,
    searchLabel: "Search referral payouts",
    searchPlaceholder: "Referrer, code, masked mobile, or reason",
    emptyIcon: Gift,
    emptyTitle:
      statusFilter === "accrued"
        ? "No referral bonuses are waiting to be paid"
        : "No referrals match these filters",
    emptyDescription: "Clear or adjust the filters to return to the referral ledger.",
    minWidth: "min-w-[1040px]",
    note: "A raised payout remains accrued until a different Admin approves it.",
  };

  return (
    <DashboardPage>
      <DashboardHeader
        title="Referral payouts"
        description="Raise accrued referral rewards and see why converted referrals did not earn a bonus."
      />
      <MoneyLedgerView
        ledger={ledger}
        loading={loading}
        error={error}
        onRetry={() => void reload()}
        dialogs={
          <ReferralPayoutDialog
            referral={active}
            onOpenChange={(open) => !open && setActive(null)}
            onPay={payBonus}
          />
        }
      />
    </DashboardPage>
  );
}
