"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Wallet, XCircle } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError, RequiredIndicator } from "@/components/ui/field-error";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import { AdminPagination, ADMIN_PAGE_SIZE, isInDateRange } from "./admin-list-tools";
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
  const { session } = useAuth();
  const canReview = session?.role === "admin";
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
    issueCheque,
    clearCheque,
    failCheque,
    reverseCheque,
    truncated,
  } = useAdminPayouts();

  const [active, setActive] = React.useState<Payout | null>(null);
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [reasonError, setReasonError] = React.useState<string>();
  const [busy, setBusy] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [manualActive, setManualActive] = React.useState<Payout | null>(null);
  const [manualFailure, setManualFailure] = React.useState(false);
  const [manualValue, setManualValue] = React.useState("");
  const [manualError, setManualError] = React.useState<string>();
  const [search, setSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [page, setPage] = React.useState(0);
  const filteredPayouts = React.useMemo(() => payouts.filter((payout) => (
    (typeFilter === "all" || payout.type === typeFilter) &&
    isInDateRange(payout.created_at, dateFrom, dateTo) &&
    `${payout.recipient_name ?? ""} ${payout.recipient_code ?? ""} ${payout.maker_name ?? ""}`.toLowerCase().includes(search.toLowerCase())
  )), [dateFrom, dateTo, payouts, search, typeFilter]);
  React.useEffect(() => setPage(0), [dateFrom, dateTo, search, statusFilter, typeFilter]);
  const pagePayouts = filteredPayouts.slice(page * ADMIN_PAGE_SIZE, (page + 1) * ADMIN_PAGE_SIZE);

  function openDecision(payout: Payout) {
    setActive(payout);
    setRejecting(false);
    setReason("");
    setReasonError(undefined);
  }

  function openManualAction(payout: Payout) {
    setManualActive(payout);
    setManualFailure(false);
    setManualValue("");
    setManualError(undefined);
  }

  function closeManualAction() {
    setManualActive(null);
    setManualFailure(false);
    setManualValue("");
    setManualError(undefined);
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
      setReasonError("Explain why this payout is being rejected.");
      requestAnimationFrame(() => document.getElementById("payout-rejection-reason")?.focus());
      return;
    }
    setReasonError(undefined);
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

  async function onManualAction(payout: Payout) {
    const value = manualValue.trim();
    if (payout.status === "approved" && value.length < 4) {
      setManualError("Cheque reference must be at least 4 characters.");
      requestAnimationFrame(() => document.getElementById("manual-cheque-reference")?.focus());
      return;
    }
    if ((manualFailure || payout.status === "paid") && value.length === 0) {
      setManualError("Add a reason for this action.");
      requestAnimationFrame(() => document.getElementById("manual-cheque-reason")?.focus());
      return;
    }
    setManualError(undefined);

    setBusy(true);
    const res =
      payout.status === "approved"
        ? await issueCheque(payout.id, value)
        : payout.status === "processing" && manualFailure
          ? await failCheque(payout.id, value)
          : payout.status === "processing"
            ? await clearCheque(payout.id)
            : await reverseCheque(payout.id, value);
    setBusy(false);
    if (!res.ok) {
      toast.error("Could not update cheque payout", { description: res.error });
      return;
    }
    toast.success(
      payout.status === "approved"
        ? "Cheque marked issued"
        : payout.status === "processing" && manualFailure
          ? "Cheque payout marked failed"
          : payout.status === "processing"
            ? "Cheque marked cleared"
            : "Cheque payout reversed",
    );
    closeManualAction();
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
        <div className="grid w-full gap-2 sm:grid-cols-2 lg:w-auto lg:grid-cols-5">
          <Input aria-label="Search payouts" placeholder="Recipient or maker" value={search} maxLength={100} onChange={(event) => setSearch(event.target.value)} />
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
          <Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger aria-label="Filter payouts by type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All payout types</SelectItem>{Object.entries(TYPE_LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
          <Input aria-label="Payouts from date" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <Input aria-label="Payouts to date" type="date" min={dateFrom || undefined} value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
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
      ) : filteredPayouts.length === 0 ? (
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
            {pagePayouts.map((p) => {
              const approvalAction = canReview && p.status === "pending_approval";
              const manualAction =
                canReview &&
                p.provider === "manual" &&
                (p.status === "approved" || p.status === "processing" || p.status === "paid");
              const clickable = approvalAction || manualAction;
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
                    ) : p.failure_reason ? (
                      <p className="truncate text-xs text-destructive">{p.failure_reason}</p>
                    ) : p.checker_user_uuid ? (
                      <p className="truncate text-xs text-text-secondary">
                        Approved by {p.checker_name ?? "another admin"}
                      </p>
                    ) : p.viewer_is_maker ? (
                      <p className="truncate text-xs font-medium text-warning">
                        Waiting for approval by another Admin
                      </p>
                    ) : null}
                  </div>
                </div>
              );
              return (
                <li key={p.id}>
                  {clickable ? (
                    <button
                      type="button"
                      onClick={() =>
                        approvalAction ? openDecision(p) : openManualAction(p)
                      }
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
          <AdminPagination page={page} total={filteredPayouts.length} onPageChange={setPage} />
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
                  {active.viewer_is_maker
                    ? "You raised this payout. Another Admin must approve it before payment can proceed."
                    : "A payout must be approved by a different Admin than the one who raised it."}
                </p>

                {rejecting ? (
                  <div className="space-y-1.5">
                    <label htmlFor="payout-rejection-reason" className="text-sm font-medium">
                      Reason<RequiredIndicator />
                    </label>
                    <Textarea
                      id="payout-rejection-reason"
                      value={reason}
                      onChange={(e) => { setReason(e.target.value); setReasonError(undefined); }}
                      placeholder="Reason for rejection"
                      rows={3}
                      maxLength={200}
                      aria-invalid={Boolean(reasonError)}
                      aria-describedby={reasonError ? "payout-rejection-reason-error" : undefined}
                    />
                    <FieldError id="payout-rejection-reason-error">{reasonError}</FieldError>
                  </div>
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
                    {canReview ? (
                      <Button variant="outline" onClick={() => setRejecting(true)} disabled={busy}>
                        Reject
                      </Button>
                    ) : null}
                    {active.viewer_can_approve ? (
                      <Button onClick={() => void onApprove(active)} disabled={busy}>
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        Approve
                      </Button>
                    ) : null}
                  </>
                )}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={manualActive !== null} onOpenChange={(o) => !o && closeManualAction()}>
        <DialogContent className="max-w-lg">
          {manualActive ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {manualActive.status === "approved"
                    ? "Record cheque issuance"
                    : manualActive.status === "processing"
                      ? manualFailure
                        ? "Record cheque failure"
                        : "Confirm cheque clearance"
                      : "Reverse cleared cheque"}
                </DialogTitle>
                <DialogDescription>
                  {formatPaise(manualActive.amount_paise)} · {manualActive.destination_hint}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {manualActive.status === "approved" ? (
                  <div className="space-y-1.5">
                    <label htmlFor="manual-cheque-reference" className="text-sm font-medium">
                      Cheque reference<RequiredIndicator />
                    </label>
                    <Input
                      id="manual-cheque-reference"
                      value={manualValue}
                      onChange={(event) => { setManualValue(event.target.value); setManualError(undefined); }}
                      placeholder="CHQ-2026-0001"
                      maxLength={64}
                      autoComplete="off"
                      aria-invalid={Boolean(manualError)}
                      aria-describedby={manualError ? "manual-cheque-reference-error" : "manual-cheque-reference-help"}
                    />
                    <p id="manual-cheque-reference-help" className="text-xs text-text-secondary">
                      Only a masked reference and deduplication fingerprint are retained.
                    </p>
                    <FieldError id="manual-cheque-reference-error">{manualError}</FieldError>
                  </div>
                ) : manualActive.status === "processing" && !manualFailure ? (
                  <p className="rounded-lg bg-muted p-3 text-sm text-text-secondary">
                    Confirm only after the cheque has cleared. This creates the recipient&apos;s
                    paid ledger credit.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    <label htmlFor="manual-cheque-reason" className="text-sm font-medium">
                      {manualActive.status === "paid"
                        ? "Reason for reversal"
                        : "Reason for failure"}
                    </label>
                    <Textarea
                      id="manual-cheque-reason"
                      value={manualValue}
                      onChange={(event) => { setManualValue(event.target.value); setManualError(undefined); }}
                      placeholder={
                        manualActive.status === "paid"
                          ? "Reason for reversal"
                          : "Reason the cheque failed or was voided"
                      }
                      rows={3}
                      maxLength={200}
                      aria-invalid={Boolean(manualError)}
                      aria-describedby={manualError ? "manual-cheque-reason-error" : undefined}
                    />
                    <FieldError id="manual-cheque-reason-error">{manualError}</FieldError>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                {manualActive.status === "processing" && !manualFailure ? (
                  <Button
                    variant="outline"
                    onClick={() => setManualFailure(true)}
                    disabled={busy}
                  >
                    Record failure
                  </Button>
                ) : manualActive.status === "processing" && manualFailure ? (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setManualFailure(false);
                      setManualValue("");
                    }}
                    disabled={busy}
                  >
                    Back
                  </Button>
                ) : (
                  <Button variant="outline" onClick={closeManualAction} disabled={busy}>
                    Cancel
                  </Button>
                )}
                <Button
                  variant={manualFailure || manualActive.status === "paid" ? "destructive" : "default"}
                  onClick={() => void onManualAction(manualActive)}
                  disabled={busy}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {manualActive.status === "approved"
                    ? "Mark issued"
                    : manualActive.status === "processing" && manualFailure
                      ? "Mark failed"
                      : manualActive.status === "processing"
                        ? "Mark cleared"
                        : "Reverse payout"}
                </Button>
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
