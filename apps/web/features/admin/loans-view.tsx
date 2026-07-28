"use client";

import * as React from "react";
import { Inbox, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoanProgressForm } from "@/features/loans/loan-progress-form";
import { formatINR } from "@/lib/format";

import { useAdminLoans } from "./use-admin-loans";

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

const FILTER_OPTIONS = [
  { value: "", label: "All statuses" },
  ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
];

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function AdminLoansView() {
  const { items, loading, error, statusFilter, setStatusFilter, reload, updateApp } =
    useAdminLoans();
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Loan applications</h1>
          <p className="text-sm text-text-secondary">
            Review and progress any loan application across the platform.
          </p>
        </div>
        <Select
          value={statusFilter || "all"}
          onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            {FILTER_OPTIONS.map((o) => (
              <SelectItem key={o.value || "all"} value={o.value || "all"}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-border bg-card py-16">
          <Loader2 className="h-6 w-6 animate-spin text-brand-navy" aria-hidden="true" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-text-secondary">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => void reload()}>
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-12 text-center">
          <Inbox className="h-8 w-8 text-text-secondary" aria-hidden="true" />
          <p className="mt-3 font-medium text-text-primary">No loan applications</p>
          <p className="mt-1 text-sm text-text-secondary">
            Applications will show up here as clients apply.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((application) => {
            const expanded = expandedId === application.id;
            return (
              <li key={application.id} className="rounded-2xl border border-border bg-card p-4">
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : application.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-text-primary">
                      {application.customer_code} · {application.loan_type_label}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-text-secondary">
                      {application.bank_name ?? "Bank not set"}
                      {application.amount_requested
                        ? ` · ${formatINR(Number(application.amount_requested))}`
                        : ""}
                      {" · "}
                      Opened {formatDate(application.opened_at)}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {STATUS_LABEL[application.status] ?? application.status}
                  </Badge>
                </button>

                {expanded ? (
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
                      onUpdate={updateApp}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
