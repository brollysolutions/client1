"use client";

// Shared status/deal-terms control for a loan application, used by both the
// Telecaller lead-detail view and the Admin loans list. The server
// (services/loan_applications.py) is the real state-machine validator; the
// allowed-next-status computation here is only a UX hint so the picker
// doesn't offer moves that would just come back as a 409/422.

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FieldError, RequiredIndicator } from "@/components/ui/field-error";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getBanks, type Bank } from "@/lib/loans";
import type { ApiResponse } from "@/lib/api/client";

export type LoanStatusValue =
  | "new"
  | "assigned"
  | "contacted"
  | "docs_collected"
  | "submitted_to_bank"
  | "sanctioned"
  | "disbursed"
  | "closed"
  | "rejected"
  | "on_hold";

export type LoanProgressApplication = {
  id: string;
  loan_type_id: string;
  status: LoanStatusValue;
  status_reason: string | null;
  amount_sanctioned: string | null;
  bank_id: string | null;
  interest_rate: string | null;
  processing_fee: string | null;
  fee_outcome: "waived" | "cashback" | "none" | null;
  closed_at: string | null;
};

export type LoanProgressUpdatePayload = {
  status?: LoanStatusValue;
  status_reason?: string | null;
  amount_sanctioned?: string | null;
  bank_id?: string | null;
  interest_rate?: string | null;
  processing_fee?: string | null;
  fee_outcome?: "waived" | "cashback" | "none" | null;
};

const ORDER = [
  "new",
  "assigned",
  "contacted",
  "docs_collected",
  "submitted_to_bank",
  "sanctioned",
  "disbursed",
  "closed",
] as const;

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  assigned: "Assigned",
  contacted: "Contacted",
  docs_collected: "Docs collected",
  submitted_to_bank: "Submitted to bank",
  sanctioned: "Sanctioned",
  disbursed: "Disbursed",
  closed: "Closed",
  rejected: "Rejected",
  on_hold: "On hold",
};

const TERMINAL = new Set(["closed", "rejected"]);
const SUBMITTED_INDEX = ORDER.indexOf("submitted_to_bank");
const SANCTIONED_INDEX = ORDER.indexOf("sanctioned");

function effectiveIndex(status: LoanStatusValue): number {
  const i = ORDER.indexOf(status as (typeof ORDER)[number]);
  return i === -1 ? 0 : i; // on_hold/rejected fall back to the most restrictive gate
}

function nextStatusOptions(status: LoanStatusValue): LoanStatusValue[] {
  if (TERMINAL.has(status)) return [];
  if (status === "on_hold") {
    return [...ORDER.filter((s) => s !== "new"), "rejected"];
  }
  const idx = effectiveIndex(status);
  return [...ORDER.slice(idx + 1), "on_hold", "rejected"];
}

export function LoanProgressForm({
  application,
  onUpdate,
}: {
  application: LoanProgressApplication;
  onUpdate: (
    applicationId: string,
    payload: LoanProgressUpdatePayload,
  ) => Promise<ApiResponse<unknown>>;
}) {
  const [banks, setBanks] = React.useState<Pick<Bank, "id" | "name">[]>([]);
  const [status, setStatus] = React.useState<LoanStatusValue | "">("");
  const [reason, setReason] = React.useState("");
  const [amountSanctioned, setAmountSanctioned] = React.useState(
    application.amount_sanctioned ?? "",
  );
  const [bankId, setBankId] = React.useState(application.bank_id ?? "");
  const [interestRate, setInterestRate] = React.useState(application.interest_rate ?? "");
  const [processingFee, setProcessingFee] = React.useState(application.processing_fee ?? "");
  const [feeOutcome, setFeeOutcome] = React.useState(application.fee_outcome ?? "");
  const [saving, setSaving] = React.useState(false);
  const [reasonError, setReasonError] = React.useState<string>();

  React.useEffect(() => {
    let active = true;
    void getBanks(application.loan_type_id).then((res) => {
      if (!active || !res.ok) return;
      // Union in the application's already-assigned bank: if it was excluded
      // for this loan type after assignment, the filtered list would drop it
      // and the Select would render blank -- reading as a silent unset rather
      // than what it is, a bank that's no longer offered going forward.
      const fetched = res.data;
      const assigned = application.bank_id;
      const hasAssigned = assigned !== null && fetched.some((b) => b.id === assigned);
      setBanks(
        !hasAssigned && assigned !== null
          ? [...fetched, { id: assigned, name: "Previously assigned bank" }]
          : fetched,
      );
    });
    return () => {
      active = false;
    };
  }, [application.loan_type_id, application.bank_id]);

  const isTerminal = TERMINAL.has(application.status);
  const termsEnabled = effectiveIndex(application.status) >= SUBMITTED_INDEX && !isTerminal;
  const feeOutcomeEnabled = effectiveIndex(application.status) >= SANCTIONED_INDEX && !isTerminal;
  const options = nextStatusOptions(application.status);
  const requiresReason = status === "rejected" || status === "on_hold";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (requiresReason && reason.trim().length === 0) {
      setReasonError("A reason is required for this status.");
      return;
    }
    setReasonError(undefined);
    const payload: LoanProgressUpdatePayload = {};
    if (status) payload.status = status;
    if (reason.trim()) payload.status_reason = reason.trim();
    if (termsEnabled || (status && ORDER.indexOf(status as (typeof ORDER)[number]) >= SUBMITTED_INDEX)) {
      if (amountSanctioned.trim()) payload.amount_sanctioned = amountSanctioned.trim();
      if (bankId) payload.bank_id = bankId;
      if (interestRate.trim()) payload.interest_rate = interestRate.trim();
      if (processingFee.trim()) payload.processing_fee = processingFee.trim();
    }
    if (feeOutcomeEnabled && feeOutcome) payload.fee_outcome = feeOutcome as "waived" | "cashback" | "none";

    if (Object.keys(payload).length === 0) {
      toast.error("Change something before saving.");
      return;
    }

    setSaving(true);
    const res = await onUpdate(application.id, payload);
    setSaving(false);
    if (res.ok) {
      toast.success("Loan application updated");
      setStatus("");
      setReason("");
    } else {
      toast.error("Couldn't update", { description: (res as { error?: string }).error });
    }
  }

  if (isTerminal) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-text-secondary">
        This application is {STATUS_LABEL[application.status] ?? application.status}
        {application.status_reason ? `: ${application.status_reason}` : "."}
      </div>
    );
  }

  return (
    <form className="space-y-4 rounded-xl border border-border p-4" onSubmit={(e) => void onSubmit(e)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={`status-${application.id}`}>Move status to</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as LoanStatusValue)}>
            <SelectTrigger id={`status-${application.id}`} className="w-full">
              <SelectValue placeholder="Keep current status" />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o} value={o}>
                  {STATUS_LABEL[o] ?? o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {requiresReason ? (
          <div>
            <Label htmlFor={`reason-${application.id}`}>Reason<RequiredIndicator /></Label>
            <Textarea
              id={`reason-${application.id}`}
              rows={1}
              maxLength={1000}
              value={reason}
              onChange={(e) => { setReason(e.target.value); setReasonError(undefined); }}
              placeholder="Why is this on hold or rejected?"
              aria-invalid={Boolean(reasonError)}
              aria-describedby={reasonError ? `reason-${application.id}-error` : undefined}
            />
            <FieldError id={`reason-${application.id}-error`}>{reasonError}</FieldError>
          </div>
        ) : null}
      </div>

      {termsEnabled ? (
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <Label htmlFor={`sanctioned-${application.id}`}>Sanctioned (₹)</Label>
            <Input
              id={`sanctioned-${application.id}`}
              type="number"
              min={0}
              value={amountSanctioned}
              onChange={(e) => setAmountSanctioned(e.target.value)}
              placeholder="500000"
            />
          </div>
          <div>
            <Label htmlFor={`bank-${application.id}`}>Bank</Label>
            <Select value={bankId} onValueChange={setBankId}>
              <SelectTrigger id={`bank-${application.id}`} className="w-full">
                <SelectValue placeholder={banks.length ? "Choose a bank" : "No banks configured yet"} />
              </SelectTrigger>
              <SelectContent>
                {banks.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor={`rate-${application.id}`}>Rate (%)</Label>
            <Input
              id={`rate-${application.id}`}
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={interestRate}
              onChange={(e) => setInterestRate(e.target.value)}
              placeholder="8.5"
            />
          </div>
          <div>
            <Label htmlFor={`fee-${application.id}`}>Processing fee (₹)</Label>
            <Input
              id={`fee-${application.id}`}
              type="number"
              min={0}
              value={processingFee}
              onChange={(e) => setProcessingFee(e.target.value)}
              placeholder="5000"
            />
          </div>
        </div>
      ) : null}

      {feeOutcomeEnabled ? (
        <div className="sm:w-1/3">
          <Label htmlFor={`fee-outcome-${application.id}`}>Fee outcome</Label>
          <Select
            value={feeOutcome}
            onValueChange={(v) => setFeeOutcome(v as "waived" | "cashback" | "none")}
          >
            <SelectTrigger id={`fee-outcome-${application.id}`} className="w-full">
              <SelectValue placeholder="Not set" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="waived">Waived</SelectItem>
              <SelectItem value="cashback">Cashback</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <Button type="submit" size="sm" disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Save changes
      </Button>
    </form>
  );
}
