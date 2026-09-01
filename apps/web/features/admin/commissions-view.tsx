"use client";

import * as React from "react";
import { IndianRupee, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DashboardHeader, DashboardPage } from "@/features/dashboard/dashboard-ui";
import { DataTablePrimaryCell, type DataColumn } from "@/features/dashboard/data-table";
import { StatusBadge, type StatusTone } from "@/features/dashboard/status-badge";
import type { CommissionRead, EligibleDeal } from "@/lib/admin-commissions-api";
import { formatDate, formatPaise } from "@/lib/format";
import { getMoneyPayoutRequestState } from "@/lib/money-ledger";
import { CommissionEntryDialog } from "./commission-entry-dialog";
import { CommissionPayoutDialog } from "./commission-payout-dialog";
import { MoneyLedgerView, type MoneyLedgerSection } from "./money-ledger-view";
import { useAdminCommissions } from "./use-admin-commissions";

const LINE_LABEL: Record<string, string> = { loans: "Loans", real_estate: "Real Estate" };
const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "cancelled", label: "Cancelled" },
] as const;
const STATUS_META: Record<string, { label: string; tone: StatusTone }> = {
  pending: { label: "Pending", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

function dealTypeLabel(value: string): string {
  return value === "loan_application" ? "Loan disbursed" : "Property deal closed";
}

export function CommissionsView() {
  const {
    eligible,
    commissions,
    loading,
    error,
    statusFilter,
    setStatusFilter,
    reload,
    enterCommission,
    cancel,
    payCommission,
  } = useAdminCommissions();
  const [activeDeal, setActiveDeal] = React.useState<EligibleDeal | null>(null);
  const [payTarget, setPayTarget] = React.useState<CommissionRead | null>(null);
  const [cancelTarget, setCancelTarget] = React.useState<CommissionRead | null>(null);
  const [cancelReason, setCancelReason] = React.useState("");
  const [cancelling, setCancelling] = React.useState(false);

  function closeCancelDialog() {
    setCancelTarget(null);
    setCancelReason("");
  }

  async function onConfirmCancel() {
    if (!cancelTarget || cancelReason.trim().length === 0) return;
    setCancelling(true);
    const response = await cancel(cancelTarget.id, cancelReason.trim());
    setCancelling(false);
    if (!response.ok) {
      toast.error("Could not cancel the commission", { description: response.error });
      return;
    }
    toast.success("Commission cancelled");
    closeCancelDialog();
  }

  const eligibleColumns = React.useMemo<readonly DataColumn<EligibleDeal>[]>(
    () => [
      {
        key: "agent",
        header: "Agent",
        render: (deal) => (
          <DataTablePrimaryCell
            title={deal.agent_name ?? "Unknown agent"}
            subtitle={deal.agent_code}
          />
        ),
      },
      {
        key: "line",
        header: "Line",
        render: (deal) => LINE_LABEL[deal.business_line] ?? deal.business_line,
      },
      { key: "source", header: "Eligible outcome", render: (deal) => dealTypeLabel(deal.deal_type) },
      { key: "date", header: "Eligible since", render: (deal) => formatDate(deal.eligible_since) },
      {
        key: "action",
        header: "Action",
        align: "right",
        render: (deal) => (
          <Button size="sm" onClick={() => setActiveDeal(deal)}>
            Enter commission
          </Button>
        ),
      },
    ],
    [],
  );

  const ledgerColumns = React.useMemo<readonly DataColumn<CommissionRead>[]>(
    () => [
      {
        key: "agent",
        header: "Agent",
        render: (commission) => (
          <DataTablePrimaryCell
            title={commission.agent_name ?? "Unknown agent"}
            subtitle={commission.agent_code}
          />
        ),
      },
      {
        key: "line",
        header: "Line",
        render: (commission) => LINE_LABEL[commission.business_line] ?? commission.business_line,
      },
      {
        key: "source",
        header: "Source",
        render: (commission) => dealTypeLabel(commission.deal_type),
      },
      {
        key: "amount",
        header: "Amount",
        align: "right",
        render: (commission) => (
          <span className="font-medium tabular-nums">
            {formatPaise(commission.agreed_amount_paise)}
          </span>
        ),
      },
      { key: "date", header: "Entered", render: (commission) => formatDate(commission.created_at) },
      {
        key: "state",
        header: "State",
        render: (commission) => {
          const payoutState = getMoneyPayoutRequestState({
            status: commission.status,
            payableStatus: "pending",
            payoutId: commission.payout_uuid,
          });
          if (payoutState === "awaiting_approval") {
            return <StatusBadge tone="warning">Payout raised</StatusBadge>;
          }
          const meta = STATUS_META[commission.status] ?? {
            label: commission.status,
            tone: "neutral" as const,
          };
          return (
            <div className="space-y-1">
              <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
              {commission.cancelled_reason ? (
                <p className="max-w-56 truncate text-xs text-text-secondary">
                  {commission.cancelled_reason}
                </p>
              ) : null}
            </div>
          );
        },
      },
      {
        key: "action",
        header: "Action",
        align: "right",
        render: (commission) =>
          getMoneyPayoutRequestState({
            status: commission.status,
            payableStatus: "pending",
            payoutId: commission.payout_uuid,
          }) === "payable" ? (
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setCancelTarget(commission)}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => setPayTarget(commission)}>
                Pay
              </Button>
            </div>
          ) : null,
      },
    ],
    [],
  );

  const eligibleSection: MoneyLedgerSection<EligibleDeal> = {
    title: "Eligible deals",
    description: "Disbursed loans and closed property deals waiting for a negotiated entry.",
    rows: eligible,
    columns: eligibleColumns,
    rowKey: (deal) => `${deal.deal_type}:${deal.deal_uuid}`,
    searchText: (deal) => `${deal.agent_name ?? ""} ${deal.agent_code} ${deal.deal_type}`,
    line: (deal) => deal.business_line,
    date: (deal) => deal.eligible_since,
    searchLabel: "Search eligible commission deals",
    searchPlaceholder: "Agent, code, or outcome",
    emptyIcon: IndianRupee,
    emptyTitle: "No deals are waiting for a commission entry",
    emptyDescription: "A disbursed loan or closed property deal will appear here when eligible.",
    minWidth: "min-w-[820px]",
  };
  const ledgerSection: MoneyLedgerSection<CommissionRead> = {
    title: "Commission ledger",
    description: "Negotiated amounts, payout state, and cancellation history.",
    rows: commissions,
    columns: ledgerColumns,
    rowKey: (commission) => commission.id,
    searchText: (commission) =>
      `${commission.agent_name ?? ""} ${commission.agent_code} ${commission.cancelled_reason ?? ""}`,
    status: (commission) => commission.status,
    line: (commission) => commission.business_line,
    date: (commission) => commission.created_at,
    statusOptions: STATUS_OPTIONS,
    statusLabel: "commission states",
    initialStatus: statusFilter,
    onStatusChange: setStatusFilter,
    searchLabel: "Search commissions",
    searchPlaceholder: "Agent, code, or cancellation reason",
    emptyIcon: IndianRupee,
    emptyTitle: "No commissions match these filters",
    emptyDescription: "Clear or adjust the filters to return to the ledger.",
    minWidth: "min-w-[980px]",
    note: "A raised payout remains pending until a different Admin approves it.",
  };

  return (
    <DashboardPage>
      <DashboardHeader
        title="Agent commissions"
        description="Record negotiated commission, then raise its payout through the maker-checker flow."
      />
      <MoneyLedgerView
        eligible={eligibleSection}
        ledger={ledgerSection}
        eligibleTabLabel="Eligible deals"
        ledgerTabLabel="Commission ledger"
        loading={loading}
        error={error}
        onRetry={() => void reload()}
        dialogs={
          <>
            <CommissionEntryDialog
              deal={activeDeal}
              onOpenChange={(open) => !open && setActiveDeal(null)}
              onEnter={enterCommission}
            />
            <CommissionPayoutDialog
              commission={payTarget}
              onOpenChange={(open) => !open && setPayTarget(null)}
              onPay={payCommission}
            />
            <Dialog open={cancelTarget !== null} onOpenChange={(open) => !open && closeCancelDialog()}>
              <DialogContent className="max-w-lg">
                {cancelTarget ? (
                  <>
                    <DialogHeader>
                      <DialogTitle>Cancel commission</DialogTitle>
                      <DialogDescription>
                        {formatPaise(cancelTarget.agreed_amount_paise)} for{" "}
                        {cancelTarget.agent_name ?? cancelTarget.agent_code}. This frees the deal
                        for a fresh entry.
                      </DialogDescription>
                    </DialogHeader>
                    <Textarea
                      value={cancelReason}
                      onChange={(event) => setCancelReason(event.target.value)}
                      placeholder="Reason for cancelling"
                      rows={3}
                      maxLength={500}
                      autoFocus
                    />
                    <DialogFooter className="gap-2 sm:gap-2">
                      <Button variant="ghost" onClick={closeCancelDialog} disabled={cancelling}>
                        Back
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => void onConfirmCancel()}
                        disabled={cancelling || cancelReason.trim().length === 0}
                      >
                        {cancelling ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : null}
                        Confirm cancel
                      </Button>
                    </DialogFooter>
                  </>
                ) : null}
              </DialogContent>
            </Dialog>
          </>
        }
      />
    </DashboardPage>
  );
}
