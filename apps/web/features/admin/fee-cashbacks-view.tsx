"use client";

import * as React from "react";
import { Banknote, Loader2 } from "lucide-react";
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
import type { EligibleFeeApplication, FeeCashbackRead } from "@/lib/admin-fee-cashbacks-api";
import { formatDate, formatPaise } from "@/lib/format";
import { getMoneyPayoutRequestState } from "@/lib/money-ledger";
import { FeeCashbackEntryDialog } from "./fee-cashback-entry-dialog";
import { FeeCashbackPayoutDialog } from "./fee-cashback-payout-dialog";
import { MoneyLedgerView, type MoneyLedgerSection } from "./money-ledger-view";
import { useAdminFeeCashbacks } from "./use-admin-fee-cashbacks";

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

export function FeeCashbacksView() {
  const {
    eligible,
    cashbacks,
    loading,
    error,
    statusFilter,
    setStatusFilter,
    reload,
    enterFeeCashback,
    cancel,
    payFeeCashback,
  } = useAdminFeeCashbacks();
  const [activeApplication, setActiveApplication] = React.useState<EligibleFeeApplication | null>(
    null,
  );
  const [payTarget, setPayTarget] = React.useState<FeeCashbackRead | null>(null);
  const [cancelTarget, setCancelTarget] = React.useState<FeeCashbackRead | null>(null);
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
      toast.error("Could not cancel the cashback", { description: response.error });
      return;
    }
    toast.success("Cashback cancelled");
    closeCancelDialog();
  }

  const eligibleColumns = React.useMemo<readonly DataColumn<EligibleFeeApplication>[]>(
    () => [
      {
        key: "client",
        header: "Client",
        render: (application) => (
          <DataTablePrimaryCell
            title={application.client_name ?? "Unknown client"}
            subtitle="Disbursed loan"
          />
        ),
      },
      {
        key: "line",
        header: "Line",
        render: (application) =>
          LINE_LABEL[application.business_line] ?? application.business_line,
      },
      {
        key: "fee",
        header: "Fee charged",
        align: "right",
        render: (application) => (
          <span className="tabular-nums">{formatPaise(application.processing_fee_paise)}</span>
        ),
      },
      {
        key: "date",
        header: "Eligible since",
        render: (application) => formatDate(application.eligible_since),
      },
      {
        key: "action",
        header: "Action",
        align: "right",
        render: (application) => (
          <Button size="sm" onClick={() => setActiveApplication(application)}>
            Enter cashback
          </Button>
        ),
      },
    ],
    [],
  );

  const ledgerColumns = React.useMemo<readonly DataColumn<FeeCashbackRead>[]>(
    () => [
      {
        key: "client",
        header: "Client",
        render: (cashback) => (
          <DataTablePrimaryCell
            title={cashback.client_name ?? "Unknown client"}
            subtitle={`Fee charged: ${formatPaise(cashback.processing_fee_paise)}`}
          />
        ),
      },
      {
        key: "line",
        header: "Line",
        render: (cashback) => LINE_LABEL[cashback.business_line] ?? cashback.business_line,
      },
      {
        key: "amount",
        header: "Cashback",
        align: "right",
        render: (cashback) => (
          <span className="font-medium tabular-nums">{formatPaise(cashback.amount_paise)}</span>
        ),
      },
      { key: "date", header: "Entered", render: (cashback) => formatDate(cashback.created_at) },
      {
        key: "state",
        header: "State",
        render: (cashback) => {
          const payoutState = getMoneyPayoutRequestState({
            status: cashback.status,
            payableStatus: "pending",
            payoutId: cashback.payout_uuid,
          });
          if (payoutState === "awaiting_approval") {
            return <StatusBadge tone="warning">Payout raised</StatusBadge>;
          }
          const meta = STATUS_META[cashback.status] ?? {
            label: cashback.status,
            tone: "neutral" as const,
          };
          return (
            <div className="space-y-1">
              <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
              {cashback.cancelled_reason ? (
                <p className="max-w-56 truncate text-xs text-text-secondary">
                  {cashback.cancelled_reason}
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
        render: (cashback) =>
          getMoneyPayoutRequestState({
            status: cashback.status,
            payableStatus: "pending",
            payoutId: cashback.payout_uuid,
          }) === "payable" ? (
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setCancelTarget(cashback)}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => setPayTarget(cashback)}>
                Pay
              </Button>
            </div>
          ) : null,
      },
    ],
    [],
  );

  const eligibleSection: MoneyLedgerSection<EligibleFeeApplication> = {
    title: "Eligible applications",
    description: "Disbursed loans carrying a processing-fee cashback outcome.",
    rows: eligible,
    columns: eligibleColumns,
    rowKey: (application) => application.loan_application_uuid,
    searchText: (application) => `${application.client_name ?? ""} loan disbursed`,
    line: (application) => application.business_line,
    date: (application) => application.eligible_since,
    searchLabel: "Search eligible cashback applications",
    searchPlaceholder: "Client or outcome",
    emptyIcon: Banknote,
    emptyTitle: "No applications are waiting for a cashback entry",
    emptyDescription: "Eligible disbursed applications will appear here automatically.",
    minWidth: "min-w-[760px]",
  };
  const ledgerSection: MoneyLedgerSection<FeeCashbackRead> = {
    title: "Cashback ledger",
    description: "Entered amounts, payout state, and cancellation history.",
    rows: cashbacks,
    columns: ledgerColumns,
    rowKey: (cashback) => cashback.id,
    searchText: (cashback) => `${cashback.client_name ?? ""} ${cashback.cancelled_reason ?? ""}`,
    status: (cashback) => cashback.status,
    line: (cashback) => cashback.business_line,
    date: (cashback) => cashback.created_at,
    statusOptions: STATUS_OPTIONS,
    statusLabel: "cashback states",
    initialStatus: statusFilter,
    onStatusChange: setStatusFilter,
    searchLabel: "Search cashbacks",
    searchPlaceholder: "Client or cancellation reason",
    emptyIcon: Banknote,
    emptyTitle: "No cashbacks match these filters",
    emptyDescription: "Clear or adjust the filters to return to the ledger.",
    minWidth: "min-w-[900px]",
    note: "A raised payout remains pending until a different Admin approves it.",
  };

  return (
    <DashboardPage>
      <DashboardHeader
        title="Processing-fee cashback"
        description="Record an eligible cashback, then raise its payout through the maker-checker flow."
      />
      <MoneyLedgerView
        eligible={eligibleSection}
        ledger={ledgerSection}
        eligibleTabLabel="Eligible applications"
        ledgerTabLabel="Cashback ledger"
        loading={loading}
        error={error}
        onRetry={() => void reload()}
        dialogs={
          <>
            <FeeCashbackEntryDialog
              application={activeApplication}
              onOpenChange={(open) => !open && setActiveApplication(null)}
              onEnter={enterFeeCashback}
            />
            <FeeCashbackPayoutDialog
              cashback={payTarget}
              onOpenChange={(open) => !open && setPayTarget(null)}
              onPay={payFeeCashback}
            />
            <Dialog open={cancelTarget !== null} onOpenChange={(open) => !open && closeCancelDialog()}>
              <DialogContent className="max-w-lg">
                {cancelTarget ? (
                  <>
                    <DialogHeader>
                      <DialogTitle>Cancel cashback</DialogTitle>
                      <DialogDescription>
                        {formatPaise(cancelTarget.amount_paise)} for{" "}
                        {cancelTarget.client_name ?? "the client"}. This frees the application for
                        a fresh entry.
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
