"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError, RequiredIndicator } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DashboardPanel } from "@/features/dashboard/dashboard-ui";
import { FormAnswerSummary } from "@/features/loans/form-answer-summary";
import { LoanProgressForm } from "@/features/loans/loan-progress-form";
import type { ApiResponse } from "@/lib/api/client";
import { formatINR } from "@/lib/format";
import {
  apiIssuesToFieldErrors,
  focusFirstInvalidField,
  type FieldErrors,
} from "@/lib/form-validation";
import type {
  LoanApplicationProgressUpdate,
  LoanTxnCreate,
  TelecallerLoanApplication,
} from "@/lib/telecaller-api";

import {
  validateLoanTransaction,
  type LoanTransactionField,
} from "./telecaller-lead-detail-validation";

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
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? "—"
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
  const [errors, setErrors] = React.useState<FieldErrors<LoanTransactionField>>({});
  const [saving, setSaving] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  function clearError(field: LoanTransactionField) {
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validation = validateLoanTransaction({
      bankName,
      amount,
      interestRate: rate,
      txnDate,
    });
    setErrors(validation);
    if (Object.keys(validation).length > 0) {
      requestAnimationFrame(() => {
        if (formRef.current) focusFirstInvalidField(formRef.current);
      });
      return;
    }

    setSaving(true);
    const res = await onAdd(applicationId, {
      bank_name: bankName.trim(),
      amount: amount.trim(),
      interest_rate: rate.trim(),
      txn_date: txnDate,
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Transaction added");
      setBankName("");
      setAmount("");
      setRate("");
      setTxnDate("");
      setErrors({});
      return;
    }

    const serverErrors = apiIssuesToFieldErrors(res.issues, {
      bank_name: "bankName",
      amount: "amount",
      interest_rate: "interestRate",
      txn_date: "txnDate",
    });
    setErrors(serverErrors);
    requestAnimationFrame(() => {
      if (formRef.current) focusFirstInvalidField(formRef.current);
    });
    toast.error("Couldn't add transaction", { description: res.error });
  }

  const fieldId = (field: string) => `txn-${applicationId}-${field}`;

  return (
    <form
      ref={formRef}
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      onSubmit={(e) => void onSubmit(e)}
      noValidate
    >
      <div className="space-y-1.5">
        <Label htmlFor={fieldId("bank")}>
          Bank<RequiredIndicator />
        </Label>
        <Input
          id={fieldId("bank")}
          name="bank_name"
          value={bankName}
          onChange={(e) => {
            setBankName(e.target.value);
            clearError("bankName");
          }}
          placeholder="Bank name"
          maxLength={200}
          aria-required="true"
          aria-invalid={Boolean(errors.bankName)}
          aria-describedby={errors.bankName ? fieldId("bank-error") : undefined}
        />
        <FieldError id={fieldId("bank-error")} className="text-xs">
          {errors.bankName}
        </FieldError>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={fieldId("amount")}>
          Amount (₹)<RequiredIndicator />
        </Label>
        <Input
          id={fieldId("amount")}
          name="amount"
          type="number"
          inputMode="decimal"
          min="0.01"
          max="999999999999.99"
          step="0.01"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            clearError("amount");
          }}
          placeholder="500000.00"
          aria-required="true"
          aria-invalid={Boolean(errors.amount)}
          aria-describedby={errors.amount ? fieldId("amount-error") : undefined}
        />
        <FieldError id={fieldId("amount-error")} className="text-xs">
          {errors.amount}
        </FieldError>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={fieldId("rate")}>
          Interest rate (%)<RequiredIndicator />
        </Label>
        <Input
          id={fieldId("rate")}
          name="interest_rate"
          type="number"
          inputMode="decimal"
          min="0"
          max="100"
          step="0.001"
          value={rate}
          onChange={(e) => {
            setRate(e.target.value);
            clearError("interestRate");
          }}
          placeholder="8.5"
          aria-required="true"
          aria-invalid={Boolean(errors.interestRate)}
          aria-describedby={errors.interestRate ? fieldId("rate-error") : undefined}
        />
        <FieldError id={fieldId("rate-error")} className="text-xs">
          {errors.interestRate}
        </FieldError>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={fieldId("date")}>
          Transaction date<RequiredIndicator />
        </Label>
        <Input
          id={fieldId("date")}
          name="txn_date"
          type="date"
          value={txnDate}
          onChange={(e) => {
            setTxnDate(e.target.value);
            clearError("txnDate");
          }}
          aria-required="true"
          aria-invalid={Boolean(errors.txnDate)}
          aria-describedby={errors.txnDate ? fieldId("date-error") : undefined}
        />
        <FieldError id={fieldId("date-error")} className="text-xs">
          {errors.txnDate}
        </FieldError>
      </div>
      <div className="sm:col-span-2 xl:col-span-4">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Add transaction
        </Button>
      </div>
    </form>
  );
}

function TransactionHistory({ application }: { application: TelecallerLoanApplication }) {
  if (application.txns.length === 0) {
    return <p className="text-sm text-text-secondary">No transactions entered yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-text-secondary">
          <tr>
            <th scope="col" className="px-3 py-2.5 font-medium">Bank</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Amount</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Interest</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {application.txns.map((txn) => (
            <tr key={txn.id}>
              <td className="px-3 py-3 font-medium text-text-primary">
                {txn.bank_name ?? "Not recorded"}
              </td>
              <td className="px-3 py-3 tabular-nums text-text-primary">
                {txn.amount != null ? formatINR(Number(txn.amount)) : "—"}
              </td>
              <td className="px-3 py-3 tabular-nums text-text-primary">
                {txn.interest_rate != null ? `${Number(txn.interest_rate)}%` : "—"}
              </td>
              <td className="px-3 py-3 text-text-secondary">{formatDate(txn.txn_date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
      <DashboardPanel
        title="Loan application"
        description="Application details and financial progress will appear here."
      >
        <p className="text-sm text-text-secondary">No loan application on this lead yet.</p>
      </DashboardPanel>
    );
  }

  return (
    <DashboardPanel
      title={applications.length === 1 ? "Loan application" : "Loan applications"}
      description="Review the application, update its progress, and record complete transaction history."
    >
      <div className="space-y-6">
        {applications.map((application) => (
          <article key={application.id} className="overflow-hidden rounded-xl border border-border">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/25 px-4 py-3.5 sm:px-5">
              <div>
                <h3 className="font-semibold text-text-primary">{application.loan_type_name}</h3>
                <p className="mt-0.5 text-sm text-text-secondary">
                  {application.bank_name ?? "Bank not assigned"}
                  {application.amount_requested
                    ? ` · ${formatINR(Number(application.amount_requested))} requested`
                    : ""}
                </p>
              </div>
              <Badge variant="secondary">
                {STATUS_LABEL[application.status] ?? application.status}
              </Badge>
            </header>

            <div className="space-y-6 p-4 sm:p-5">
              {application.form_schema_snapshot && application.form_answers ? (
                <details className="group rounded-xl border border-border bg-muted/15">
                  <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue">
                    <span className="inline-flex items-center gap-2">
                      <span aria-hidden="true" className="text-text-secondary transition-transform group-open:rotate-90">›</span>
                      View submitted application details
                    </span>
                  </summary>
                  <div className="border-t border-border p-3">
                    <FormAnswerSummary
                      schema={application.form_schema_snapshot}
                      answers={application.form_answers}
                    />
                  </div>
                </details>
              ) : null}

              <section aria-labelledby={`progress-heading-${application.id}`} className="space-y-3">
                <div>
                  <h3 id={`progress-heading-${application.id}`} className="text-sm font-semibold text-text-primary">
                    Application progress
                  </h3>
                  <p className="mt-0.5 text-xs leading-5 text-text-secondary">
                    Move the application forward or record approved lending terms.
                  </p>
                </div>
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
              </section>

              <section aria-labelledby={`history-heading-${application.id}`} className="space-y-3 border-t border-border pt-5">
                <div>
                  <h3 id={`history-heading-${application.id}`} className="text-sm font-semibold text-text-primary">
                    Transaction history
                  </h3>
                  <p className="mt-0.5 text-xs leading-5 text-text-secondary">
                    Immutable snapshots entered by the assigned Telecaller.
                  </p>
                </div>
                <TransactionHistory application={application} />
              </section>

              <section
                aria-labelledby={`add-txn-heading-${application.id}`}
                className="space-y-4 rounded-xl border border-border bg-muted/20 p-4"
              >
                <div>
                  <h3 id={`add-txn-heading-${application.id}`} className="text-sm font-semibold text-text-primary">
                    Add transaction
                  </h3>
                  <p className="mt-0.5 text-xs leading-5 text-text-secondary">
                    All fields are required. Entries cannot be edited or deleted after they are recorded.
                  </p>
                </div>
                <AddTxnForm applicationId={application.id} onAdd={onAddTxn} />
              </section>
            </div>
          </article>
        ))}
      </div>
    </DashboardPanel>
  );
}
