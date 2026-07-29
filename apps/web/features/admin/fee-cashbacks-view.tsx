"use client";

import * as React from "react";
import { Banknote, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatPaise } from "@/lib/format";
import type { EligibleFeeApplication, FeeCashbackRead } from "@/lib/admin-fee-cashbacks-api";

import { FeeCashbackEntryDialog } from "./fee-cashback-entry-dialog";
import { FeeCashbackPayoutDialog } from "./fee-cashback-payout-dialog";
import { useAdminFeeCashbacks } from "./use-admin-fee-cashbacks";

const LINE_LABEL: Record<string, string> = { loans: "Loans", real_estate: "Real Estate" };

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  paid: "Paid",
  cancelled: "Cancelled",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-warning/10 text-warning",
  paid: "bg-success/10 text-success",
  cancelled: "bg-muted text-text-secondary",
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "cancelled", label: "Cancelled" },
  { value: "", label: "All" },
];

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function EligibleApplicationRow({
  application,
  onPick,
}: {
  application: EligibleFeeApplication;
  onPick: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-text-primary">
            {application.client_name ?? "Unknown client"}
          </span>
          <span className="text-sm text-text-secondary">
            Fee charged: {formatPaise(application.processing_fee_paise)}
          </span>
        </div>
        <p className="truncate text-xs text-text-secondary">
          {LINE_LABEL[application.business_line] ?? application.business_line}
          {" · "}
          Loan disbursed
          {" · "}
          {formatDate(application.eligible_since)}
        </p>
      </div>
      <Button size="sm" onClick={onPick}>
        Enter cashback
      </Button>
    </div>
  );
}

function FeeCashbackRow({
  cashback,
  onPay,
  onCancel,
}: {
  cashback: FeeCashbackRead;
  onPay: () => void;
  onCancel: () => void;
}) {
  // payout_uuid set but status still "pending" is the real state between
  // "Pay cashback" raising a payout and that payout being approved —
  // approval is what flips status to "paid". Checking status alone would
  // leave the button live and re-clickable for that whole window (the same
  // bug PR #117's review caught on the referral-payout equivalent of this
  // row): a confused admin has no way to tell it already worked.
  const awaitingApproval = cashback.status === "pending" && cashback.payout_uuid != null;
  const payable = cashback.status === "pending" && cashback.payout_uuid == null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-text-primary">
            {formatPaise(cashback.amount_paise)}
          </span>
          <Badge className={STATUS_STYLE[cashback.status] ?? "bg-muted text-text-secondary"}>
            {STATUS_LABEL[cashback.status] ?? cashback.status}
          </Badge>
        </div>
        <p className="truncate text-sm text-text-secondary">
          {cashback.client_name ?? "Unknown client"}
        </p>
        <p className="truncate text-xs text-text-secondary">
          {LINE_LABEL[cashback.business_line] ?? cashback.business_line}
          {" · "}
          Fee charged: {formatPaise(cashback.processing_fee_paise)}
          {" · "}
          {formatDate(cashback.created_at)}
        </p>
        {cashback.cancelled_reason ? (
          <p className="truncate text-xs text-text-secondary">
            Cancelled: {cashback.cancelled_reason}
          </p>
        ) : null}
      </div>
      {payable ? (
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={onPay}>
            Pay cashback
          </Button>
        </div>
      ) : awaitingApproval ? (
        <Badge className="bg-warning/10 text-warning">Payout raised</Badge>
      ) : null}
    </div>
  );
}

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
    const res = await cancel(cancelTarget.id, cancelReason.trim());
    setCancelling(false);
    if (res.ok) {
      toast.success("Cashback cancelled");
      closeCancelDialog();
    } else {
      toast.error("Could not cancel the cashback", { description: res.error });
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Processing-fee cashback</h1>
        <p className="text-sm text-text-secondary">
          Return the processing fee to a client whose loan disbursed with a cashback outcome.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-text-secondary">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => void reload()}>
            Try again
          </Button>
        </div>
      ) : (
        <Tabs defaultValue="eligible">
          <TabsList>
            <TabsTrigger value="eligible">Eligible applications</TabsTrigger>
            <TabsTrigger value="all">All cashbacks</TabsTrigger>
          </TabsList>

          <TabsContent value="eligible" className="mt-4">
            {loading ? (
              <div className="flex items-center justify-center rounded-2xl border border-border bg-card py-16">
                <Loader2 className="h-6 w-6 animate-spin text-brand-navy" aria-hidden="true" />
              </div>
            ) : eligible.length === 0 ? (
              <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-12 text-center">
                <Banknote className="h-8 w-8 text-text-secondary" aria-hidden="true" />
                <p className="mt-3 font-medium text-text-primary">
                  No applications are waiting for a cashback entry.
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {eligible.map((application) => (
                  <li key={application.loan_application_uuid}>
                    <EligibleApplicationRow
                      application={application}
                      onPick={() => setActiveApplication(application)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="all" className="mt-4 space-y-4">
            <Select
              value={statusFilter || "all"}
              onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}
            >
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Pending" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value || "all"} value={o.value || "all"}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {loading ? (
              <div className="flex items-center justify-center rounded-2xl border border-border bg-card py-16">
                <Loader2 className="h-6 w-6 animate-spin text-brand-navy" aria-hidden="true" />
              </div>
            ) : cashbacks.length === 0 ? (
              <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-12 text-center">
                <Banknote className="h-8 w-8 text-text-secondary" aria-hidden="true" />
                <p className="mt-3 font-medium text-text-primary">
                  No cashbacks match this filter.
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {cashbacks.map((c) => (
                  <li key={c.id}>
                    <FeeCashbackRow
                      cashback={c}
                      onPay={() => setPayTarget(c)}
                      onCancel={() => setCancelTarget(c)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      )}

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

      <Dialog open={cancelTarget != null} onOpenChange={(o) => !o && closeCancelDialog()}>
        <DialogContent className="max-w-lg">
          {cancelTarget ? (
            <>
              <DialogHeader>
                <DialogTitle>Cancel cashback</DialogTitle>
                <DialogDescription>
                  {formatPaise(cancelTarget.amount_paise)} for{" "}
                  {cancelTarget.client_name ?? "the client"}. This frees the application for a
                  fresh entry.
                </DialogDescription>
              </DialogHeader>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
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
                  {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Confirm cancel
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
