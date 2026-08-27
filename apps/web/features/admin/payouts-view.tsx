"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Wallet, XCircle } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/session-provider";
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
import { Textarea } from "@/components/ui/textarea";
import { DashboardHeader, DashboardPage, DashboardPanel } from "@/features/dashboard/dashboard-ui";
import {
  DataTable,
  DataTablePrimaryCell,
  type DataColumn,
} from "@/features/dashboard/data-table";
import { FetchError } from "@/features/dashboard/fetch-error";
import {
  EMPTY_FILTERS,
  FilterBar,
  matchesSearch,
  type FilterBarValue,
} from "@/features/dashboard/filter-bar";
import {
  ListEmptyState,
  ListLoadingState,
  ListPagination,
} from "@/features/dashboard/list-states";
import { StatusBadge, type StatusTone } from "@/features/dashboard/status-badge";
import { useFilteredPage } from "@/features/dashboard/use-filtered-page";
import { isInDateRange } from "@/lib/date-range";
import { formatDate, formatPaise } from "@/lib/format";
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

const STATUS_TONE: Record<PayoutStatus, StatusTone> = {
  pending_approval: "warning",
  approved: "warning",
  initiated: "warning",
  processing: "warning",
  paid: "success",
  rejected: "danger",
  failed: "danger",
  reversed: "danger",
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
];

const TYPE_OPTIONS = Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }));

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
  const [filters, setFilters] = React.useState<FilterBarValue>({
    ...EMPTY_FILTERS,
    status: statusFilter,
  });

  React.useEffect(() => {
    setFilters((current) => ({ ...current, status: statusFilter || "all" }));
  }, [statusFilter]);

  const filteredPayouts = React.useMemo(
    () =>
      payouts.filter(
        (payout) =>
          (filters.kind === "all" || payout.type === filters.kind) &&
          (filters.line === "all" || payout.business_line === filters.line) &&
          isInDateRange(payout.created_at, filters.from, filters.to) &&
          (!filters.search ||
            matchesSearch(
              `${payout.recipient_name ?? ""} ${payout.recipient_code ?? ""} ${
                payout.maker_name ?? ""
              } ${payout.checker_name ?? ""} ${payout.destination_hint} ${
                TYPE_LABEL[payout.type] ?? payout.type
              }`,
              filters.search,
            )),
      ),
    [filters, payouts],
  );
  const page = useFilteredPage(filteredPayouts, filters);

  function updateFilters(next: FilterBarValue) {
    setFilters(next);
    if (next.status !== filters.status) {
      setStatusFilter(next.status === "all" ? "" : next.status);
    }
  }

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

  const columns = React.useMemo<readonly DataColumn<Payout>[]>(
    () => [
      {
        key: "recipient",
        header: "Recipient",
        render: (payout) => (
          <DataTablePrimaryCell
            title={payout.recipient_name ?? "Unknown recipient"}
            subtitle={
              payout.recipient_code ??
              (payout.recipient_user_uuid
                ? shortId(payout.recipient_user_uuid)
                : "Deleted account")
            }
          />
        ),
      },
      {
        key: "type",
        header: "Type / line",
        render: (payout) => (
          <DataTablePrimaryCell
            title={TYPE_LABEL[payout.type] ?? payout.type}
            subtitle={payout.business_line === "real_estate" ? "Real Estate" : "Loans"}
          />
        ),
      },
      {
        key: "amount",
        header: "Amount",
        align: "right",
        render: (payout) => (
          <span className="font-medium tabular-nums">{formatPaise(payout.amount_paise)}</span>
        ),
      },
      {
        key: "destination",
        header: "Destination",
        render: (payout) => payout.destination_hint,
      },
      {
        key: "maker",
        header: "Raised",
        render: (payout) => (
          <DataTablePrimaryCell
            title={payout.maker_name ?? "Another admin"}
            subtitle={formatDate(payout.created_at)}
          />
        ),
      },
      {
        key: "state",
        header: "State",
        render: (payout) => (
          <div className="space-y-1">
            <StatusBadge tone={STATUS_TONE[payout.status]}>{STATUS_LABEL[payout.status]}</StatusBadge>
            {payout.status === "rejected" ? (
              <p className="max-w-56 truncate text-xs text-destructive">
                {payout.rejected_by_name ?? "Another admin"}: {payout.reject_reason}
              </p>
            ) : payout.failure_reason ? (
              <p className="max-w-56 truncate text-xs text-destructive">{payout.failure_reason}</p>
            ) : payout.checker_user_uuid ? (
              <p className="max-w-56 truncate text-xs text-text-secondary">
                Approved by {payout.checker_name ?? "another admin"}
              </p>
            ) : payout.viewer_is_maker && payout.status === "pending_approval" ? (
              <p className="max-w-56 text-xs text-warning">Needs another Admin</p>
            ) : null}
          </div>
        ),
      },
      {
        key: "action",
        header: "Action",
        align: "right",
        render: (payout) => {
          const approvalAction = canReview && payout.status === "pending_approval";
          const manualAction =
            canReview &&
            payout.provider === "manual" &&
            (payout.status === "approved" ||
              payout.status === "processing" ||
              payout.status === "paid");
          if (approvalAction) {
            return (
              <Button size="sm" variant="outline" onClick={() => openDecision(payout)}>
                Review
              </Button>
            );
          }
          if (manualAction) {
            return (
              <Button size="sm" variant="outline" onClick={() => openManualAction(payout)}>
                Update cheque
              </Button>
            );
          }
          return null;
        },
      },
    ],
    [canReview],
  );

  return (
    <DashboardPage>
      <DashboardHeader
        title="Payouts"
        description="Approve, reject, and settle cashback, referral, and commission disbursements."
        actions={<Button onClick={() => setCreateOpen(true)}>Raise a payout</Button>}
      />

      <FilterBar
        value={filters}
        onChange={updateFilters}
        searchLabel="Search payouts"
        searchPlaceholder="Recipient, maker, checker, or destination"
        statusOptions={FILTER_OPTIONS}
        statusLabel="payout states"
        kindOptions={TYPE_OPTIONS}
        kindLabel="Payout types"
        note="The Admin who raises a payout cannot approve it. Manual cheques settle only after clearance."
      />

      {status === "error" ? (
        <FetchError status={errorStatus} message={error} onRetry={retry} />
      ) : (
        <DashboardPanel
          title="Payout ledger"
          description="Maker-checker approvals and settlement state across every money programme."
          bodyClassName="p-0"
        >
          {status === "loading" ? (
            <div className="p-5">
              <ListLoadingState rows={7} />
            </div>
          ) : filteredPayouts.length === 0 ? (
            <ListEmptyState
              icon={Wallet}
              title={
                statusFilter === "pending_approval"
                  ? "No payouts are waiting for approval"
                  : "No payouts match these filters"
              }
              description="Clear or adjust the filters to return to the payout ledger."
              className="m-5"
            />
          ) : (
            <>
              <DataTable
                  columns={columns}
                  rows={page.pageRows}
                  rowKey={(payout) => payout.id}
                  minWidth="min-w-[1080px]"
                />
              <div className="space-y-3 px-5 pb-5">
                {truncated ? (
                  <p className="text-xs text-text-secondary">
                    Showing the 100 most recent. Filter by status to narrow this down.
                  </p>
                ) : null}
                <ListPagination page={page.page} total={page.total} onPageChange={page.setPage} />
              </div>
            </>
          )}
        </DashboardPanel>
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
    </DashboardPage>
  );
}
