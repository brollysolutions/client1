"use client";

import * as React from "react";
import { IndianRupee, Loader2 } from "lucide-react";
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
import { ListPagination, useListPagination } from "@/features/dashboard/list-pagination";
import { formatPaise } from "@/lib/format";
import type { CommissionRead, EligibleDeal } from "@/lib/admin-commissions-api";

import { CommissionEntryDialog } from "./commission-entry-dialog";
import { CommissionPayoutDialog } from "./commission-payout-dialog";
import { useAdminCommissions } from "./use-admin-commissions";

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

function EligibleDealRow({ deal, onPick }: { deal: EligibleDeal; onPick: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-text-primary">
            {deal.agent_name ?? "Unknown agent"}
          </span>
          <span className="text-sm text-text-secondary">{deal.agent_code}</span>
        </div>
        <p className="truncate text-xs text-text-secondary">
          {LINE_LABEL[deal.business_line] ?? deal.business_line}
          {" · "}
          {deal.deal_type === "loan_application" ? "Loan disbursed" : "Deal closed"}
          {" · "}
          {formatDate(deal.eligible_since)}
        </p>
      </div>
      <Button size="sm" onClick={onPick}>
        Enter commission
      </Button>
    </div>
  );
}

function CommissionRow({
  commission,
  onPay,
  onCancel,
}: {
  commission: CommissionRead;
  onPay: () => void;
  onCancel: () => void;
}) {
  // payout_uuid set but status still "pending" is the real state between
  // "Pay commission" raising a payout and that payout being approved —
  // approval is what flips status to "paid". Checking status alone would
  // leave the button live and re-clickable for that whole window (the exact
  // bug PR #117's review caught on the referral-payout equivalent of this
  // row): a confused admin has no way to tell it already worked.
  const awaitingApproval = commission.status === "pending" && commission.payout_uuid != null;
  const payable = commission.status === "pending" && commission.payout_uuid == null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-text-primary">
            {formatPaise(commission.agreed_amount_paise)}
          </span>
          <Badge className={STATUS_STYLE[commission.status] ?? "bg-muted text-text-secondary"}>
            {STATUS_LABEL[commission.status] ?? commission.status}
          </Badge>
        </div>
        <p className="truncate text-sm text-text-secondary">
          {commission.agent_name ?? "Unknown agent"} · {commission.agent_code}
        </p>
        <p className="truncate text-xs text-text-secondary">
          {LINE_LABEL[commission.business_line] ?? commission.business_line}
          {" · "}
          {commission.deal_type === "loan_application" ? "Loan" : "Property deal"}
          {" · "}
          {formatDate(commission.created_at)}
        </p>
        {commission.cancelled_reason ? (
          <p className="truncate text-xs text-text-secondary">
            Cancelled: {commission.cancelled_reason}
          </p>
        ) : null}
      </div>
      {payable ? (
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={onPay}>
            Pay commission
          </Button>
        </div>
      ) : awaitingApproval ? (
        <Badge className="bg-warning/10 text-warning">Payout raised</Badge>
      ) : null}
    </div>
  );
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
  const eligiblePagination = useListPagination(eligible);
  const commissionPagination = useListPagination(commissions);
  const setCommissionPage = commissionPagination.setPage;

  React.useEffect(() => {
    setCommissionPage(0);
  }, [statusFilter, setCommissionPage]);

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
      toast.success("Commission cancelled");
      closeCancelDialog();
    } else {
      toast.error("Could not cancel the commission", { description: res.error });
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Agent commissions</h1>
        <p className="text-sm text-text-secondary">
          Record the negotiated commission for a disbursed loan or a closed property deal.
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
            <TabsTrigger value="eligible">Eligible deals</TabsTrigger>
            <TabsTrigger value="all">All commissions</TabsTrigger>
          </TabsList>

          <TabsContent value="eligible" className="mt-4">
            {loading ? (
              <div className="flex items-center justify-center rounded-2xl border border-border bg-card py-16">
                <Loader2 className="h-6 w-6 animate-spin text-brand-navy" aria-hidden="true" />
              </div>
            ) : eligible.length === 0 ? (
              <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-12 text-center">
                <IndianRupee className="h-8 w-8 text-text-secondary" aria-hidden="true" />
                <p className="mt-3 font-medium text-text-primary">
                  No deals are waiting for a commission entry.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
              <ul className="space-y-3">
                {eligiblePagination.pageItems.map((deal) => (
                  <li key={`${deal.deal_type}:${deal.deal_uuid}`}>
                    <EligibleDealRow deal={deal} onPick={() => setActiveDeal(deal)} />
                  </li>
                ))}
              </ul>
              <ListPagination page={eligiblePagination.page} total={eligible.length} onPageChange={eligiblePagination.setPage} label="Eligible commission deals pages" />
              </div>
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
            ) : commissions.length === 0 ? (
              <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-12 text-center">
                <IndianRupee className="h-8 w-8 text-text-secondary" aria-hidden="true" />
                <p className="mt-3 font-medium text-text-primary">
                  No commissions match this filter.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
              <ul className="space-y-3">
                {commissionPagination.pageItems.map((c) => (
                  <li key={c.id}>
                    <CommissionRow
                      commission={c}
                      onPay={() => setPayTarget(c)}
                      onCancel={() => setCancelTarget(c)}
                    />
                  </li>
                ))}
              </ul>
              <ListPagination page={commissionPagination.page} total={commissions.length} onPageChange={commissionPagination.setPage} label="Commissions pages" />
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

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

      <Dialog open={cancelTarget != null} onOpenChange={(o) => !o && closeCancelDialog()}>
        <DialogContent className="max-w-lg">
          {cancelTarget ? (
            <>
              <DialogHeader>
                <DialogTitle>Cancel commission</DialogTitle>
                <DialogDescription>
                  {formatPaise(cancelTarget.agreed_amount_paise)} for{" "}
                  {cancelTarget.agent_name ?? cancelTarget.agent_code}. This frees the deal for a
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
