"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Wallet, XCircle } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { FetchError } from "@/features/dashboard/fetch-error";
import { formatPaise } from "@/lib/format";
import type { Payout, PayoutStatus } from "@/lib/payouts-api";

import { PayoutCreateDialog } from "./payout-create-dialog";
import { useAdminPayouts } from "./use-admin-payouts";

const TYPE_LABEL: Record<string, string> = {
  cashback: "Cashback",
  referral_bonus: "Referral bonus",
  commission: "Commission",
};

const STATUS_LABEL: Record<PayoutStatus, string> = {
  pending_approval: "Awaiting approval",
  approved: "Approved",
  rejected: "Rejected",
  initiated: "Initiated",
  processing: "Processing",
  paid: "Paid",
  failed: "Failed",
  reversed: "Reversed",
};

const STATUS_BADGE_CLASS: Record<PayoutStatus, string> = {
  pending_approval: "bg-warning/10 text-warning",
  approved: "bg-warning/10 text-warning",
  initiated: "bg-warning/10 text-warning",
  processing: "bg-warning/10 text-warning",
  paid: "bg-success/10 text-success",
  rejected: "bg-destructive/10 text-destructive",
  failed: "bg-destructive/10 text-destructive",
  reversed: "bg-destructive/10 text-destructive",
};

const FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "pending_approval", label: "Awaiting approval" },
  { value: "approved", label: "Approved" },
  { value: "paid", label: "Paid" },
  { value: "rejected", label: "Rejected" },
  { value: "failed", label: "Failed" },
  { value: "reversed", label: "Reversed" },
  { value: "initiated", label: "Initiated" },
  { value: "processing", label: "Processing" },
  { value: "", label: "All" },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function shortId(id: string): string {
  return `${id.slice(0, 8)}…`;
}

export function PayoutsView() {
  const {
    payouts,
    status,
    error,
    errorStatus,
    statusFilter,
    setStatusFilter,
    retry,
    approve,
    reject,
    create,
    truncated,
  } = useAdminPayouts();

  const [active, setActive] = React.useState<Payout | null>(null);
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);

  function openDecision(payout: Payout) {
    setActive(payout);
    setRejecting(false);
    setReason("");
  }

  async function onApprove(payout: Payout) {
    setBusy(true);
    const res = await approve(payout.id);
    setBusy(false);
    if (res.ok) {
      toast.success("Payout approved");
      setActive(null);
    } else {
      toast.error("Could not approve payout", { description: res.error });
    }
  }

  async function onReject(payout: Payout) {
    if (reason.trim().length === 0) {
      toast.error("Add a reason", { description: "Explain why this payout is being rejected." });
      return;
    }
    setBusy(true);
    const res = await reject(payout.id, reason.trim());
    setBusy(false);
    if (res.ok) {
      toast.success("Payout rejected");
      setActive(null);
      setRejecting(false);
      setReason("");
    } else {
      toast.error("Could not reject payout", { description: res.error });
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Payouts</h1>
          <p className="text-sm text-text-secondary">
            Approve or reject cashback, referral, and commission disbursements.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Awaiting approval" />
            </SelectTrigger>
            <SelectContent>
              {FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value || "all"} value={o.value || "all"}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setCreateOpen(true)}>Raise a payout</Button>
        </div>
      </div>

      {status === "loading" ? (
        <div className="space-y-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      ) : status === "error" ? (
        <FetchError status={errorStatus} message={error} onRetry={retry} />
      ) : payouts.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-12 text-center">
          <Wallet className="h-8 w-8 text-text-secondary" aria-hidden="true" />
          <p className="mt-3 font-medium text-text-primary">
            {statusFilter === "pending_approval"
              ? "No payouts are waiting for approval."
              : "No payouts match this filter."}
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {payouts.map((p) => {
              const clickable = p.status === "pending_approval";
              const card = (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-text-primary">
                        {formatPaise(p.amount_paise)}
                      </span>
                      <Badge className={STATUS_BADGE_CLASS[p.status]}>
                        {STATUS_LABEL[p.status]}
                      </Badge>
                    </div>
                    <p className="truncate text-sm text-text-secondary">
                      {p.recipient_name ?? "Unknown recipient"} ·{" "}
                      {p.recipient_code ??
                        (p.recipient_user_uuid ? shortId(p.recipient_user_uuid) : "Deleted account")}
                    </p>
                    <p className="truncate text-xs text-text-secondary">
                      {TYPE_LABEL[p.type] ?? p.type} · {p.destination_hint} · Raised by{" "}
                      {p.maker_name ?? "another admin"} · {formatDate(p.created_at)}
                    </p>
                    {p.status === "rejected" ? (
                      <p className="truncate text-xs text-destructive">
                        Rejected by {p.rejected_by_name ?? "another admin"}: {p.reject_reason}
                      </p>
                    ) : p.checker_user_uuid ? (
                      <p className="truncate text-xs text-text-secondary">
                        Approved by {p.checker_name ?? "another admin"}
                      </p>
                    ) : p.failure_reason ? (
                      <p className="truncate text-xs text-destructive">{p.failure_reason}</p>
                    ) : null}
                  </div>
                </div>
              );
              return (
                <li key={p.id}>
                  {clickable ? (
                    <button
                      type="button"
                      onClick={() => openDecision(p)}
                      className="w-full text-left transition-colors hover:[&>div]:border-brand-cta"
                    >
                      {card}
                    </button>
                  ) : (
                    card
                  )}
                </li>
              );
            })}
          </ul>
          {truncated ? (
            <p className="text-xs text-text-secondary">
              Showing the 100 most recent. Filter by status to narrow this down.
            </p>
          ) : null}
        </>
      )}

      <Dialog open={active !== null} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-lg">
          {active ? (
            <>
              <DialogHeader>
                <DialogTitle>{formatPaise(active.amount_paise)}</DialogTitle>
                <DialogDescription>
                  {active.recipient_name ?? "Unknown recipient"} ·{" "}
                  {active.recipient_code ??
                    (active.recipient_user_uuid
                      ? shortId(active.recipient_user_uuid)
                      : "Deleted account")}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <dt className="text-text-secondary">Type</dt>
                    <dd className="font-medium text-text-primary">
                      {TYPE_LABEL[active.type] ?? active.type}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-text-secondary">Destination</dt>
                    <dd className="font-medium text-text-primary">{active.destination_hint}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-text-secondary">Raised by</dt>
                    <dd className="font-medium text-text-primary">
                      {active.maker_name ?? "another admin"}
                    </dd>
                  </div>
                </dl>

                <p className="rounded-lg bg-muted p-3 text-xs text-text-secondary">
                  A payout must be approved by a different admin than the one who raised it.
                </p>

                {rejecting ? (
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Reason for rejection"
                    rows={3}
                    maxLength={200}
                  />
                ) : null}
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                {rejecting ? (
                  <>
                    <Button variant="ghost" onClick={() => setRejecting(false)} disabled={busy}>
                      Back
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => void onReject(active)}
                      disabled={busy}
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                      Confirm reject
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setRejecting(true)} disabled={busy}>
                      Reject
                    </Button>
                    <Button onClick={() => void onApprove(active)} disabled={busy}>
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Approve
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <PayoutCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={create}
      />
    </div>
  );
}
