"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DashboardPanel } from "@/features/dashboard/dashboard-ui";
import { LoanProgressForm } from "@/features/loans/loan-progress-form";
import { FormAnswerSummary } from "@/features/loans/form-answer-summary";
import { formatINR } from "@/lib/format";
import type {
  LoanApplicationProgressUpdate,
  LoanTxnCreate,
  TelecallerLoanApplication,
} from "@/lib/telecaller-api";
import type { ApiResponse } from "@/lib/api/client";

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

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function AddTxnForm({
  applicationId,
  onAdd,
}: {
  applicationId: string;
  onAdd: (applicationId: string, payload: LoanTxnCreate) => Promise<ApiResponse<unknown>>;
}) {
  const [bankName, setBankName] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [rate, setRate] = React.useState("");
  const [txnDate, setTxnDate] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await onAdd(applicationId, {
      bank_name: bankName.trim() || null,
      amount: amount.trim() || null,
      interest_rate: rate.trim() || null,
      txn_date: txnDate || null,
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Transaction added");
      setBankName("");
      setAmount("");
      setRate("");
      setTxnDate("");
    } else {
      toast.error("Couldn't add transaction", { description: (res as { error?: string }).error });
    }
  }

  return (
    <form className="mt-4 grid gap-3 sm:grid-cols-4" onSubmit={(e) => void onSubmit(e)}>
      <div>
        <Label htmlFor={`bank-${applicationId}`}>Bank</Label>
        <Input
          id={`bank-${applicationId}`}
          value={bankName}
          onChange={(e) => setBankName(e.target.value)}
          placeholder="Bank name"
          maxLength={200}
        />
      </div>
      <div>
        <Label htmlFor={`amount-${applicationId}`}>Amount (₹)</Label>
        <Input
          id={`amount-${applicationId}`}
          type="number"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="500000"
        />
      </div>
      <div>
        <Label htmlFor={`rate-${applicationId}`}>Rate (%)</Label>
        <Input
          id={`rate-${applicationId}`}
          type="number"
          min={0}
          max={100}
          step="0.01"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder="8.5"
        />
      </div>
      <div>
        <Label htmlFor={`date-${applicationId}`}>Date</Label>
        <Input
          id={`date-${applicationId}`}
          type="date"
          value={txnDate}
          onChange={(e) => setTxnDate(e.target.value)}
        />
      </div>
      <div className="sm:col-span-4">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Add transaction
        </Button>
      </div>
    </form>
  );
}

export function TelecallerLoanAppsSection({
  applications,
  onAddTxn,
  onUpdateApp,
}: {
  applications: TelecallerLoanApplication[];
  onAddTxn: (applicationId: string, payload: LoanTxnCreate) => Promise<ApiResponse<unknown>>;
  onUpdateApp: (
    applicationId: string,
    payload: LoanApplicationProgressUpdate,
  ) => Promise<ApiResponse<unknown>>;
}) {
  if (applications.length === 0) {
    return (
      <DashboardPanel title="Loan applications">
        <p className="text-sm text-text-secondary">No loan application on this lead yet.</p>
      </DashboardPanel>
    );
  }

  return (
    <DashboardPanel title="Loan applications">
      <div className="space-y-5">
        {applications.map((application) => (
          <div key={application.id} className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-text-primary">{application.loan_type_name}</p>
                <p className="text-sm text-text-secondary">
                  {application.bank_name ?? "Bank not set"}
                  {application.amount_requested
                    ? ` · ${formatINR(Number(application.amount_requested))}`
                    : ""}
                </p>
              </div>
              <Badge variant="secondary">
                {STATUS_LABEL[application.status] ?? application.status}
              </Badge>
            </div>

            <div className="mt-4">
              <FormAnswerSummary
                schema={application.form_schema_snapshot}
                answers={application.form_answers}
              />
            </div>

            {application.txns.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {application.txns.map((txn) => (
                  <li
                    key={txn.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm"
                  >
                    <span className="text-text-primary">
                      {txn.bank_name ?? "Bank not set"}
                      {txn.amount ? ` · ${formatINR(Number(txn.amount))}` : ""}
                      {txn.interest_rate ? ` · ${Number(txn.interest_rate)}%` : ""}
                    </span>
                    <span className="text-xs text-text-secondary">{formatDate(txn.txn_date)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-text-secondary">No transactions entered yet.</p>
            )}

            <div className="mt-4">
              <LoanProgressForm
                application={{
                  id: application.id,
                  loan_type_id: application.loan_type_id,
                  status: application.status,
                  status_reason: application.status_reason ?? null,
                  amount_sanctioned: application.amount_sanctioned ?? null,
                  bank_id: application.bank_id ?? null,
                  interest_rate: application.interest_rate ?? null,
                  processing_fee: application.processing_fee ?? null,
                  fee_outcome: application.fee_outcome ?? null,
                  closed_at: application.closed_at ?? null,
                }}
                onUpdate={onUpdateApp}
              />
            </div>

            <AddTxnForm applicationId={application.id} onAdd={onAddTxn} />
          </div>
        ))}
      </div>
    </DashboardPanel>
  );
}
