"use client";

import { IndianRupee } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FetchError } from "@/features/dashboard/fetch-error";
import { formatPaise } from "@/lib/format";

import { useAgentEarnings } from "./use-agent-earnings";

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

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-sm text-text-secondary">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-text-primary">{value}</p>
    </div>
  );
}

export function AgentEarningsView() {
  const { earnings, status, error, errorStatus, retry } = useAgentEarnings();

  if (status === "loading") {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-5 px-4 sm:px-6 lg:px-10">
        <Skeleton className="h-9 w-48 rounded-lg" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (status === "error" || !earnings) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-10">
        <FetchError status={errorStatus} message={error} onRetry={retry} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Earnings</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Commissions Admin has recorded against your deals.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Pending" value={formatPaise(earnings.totals.pending_amount_paise)} />
        <StatTile label="Paid" value={formatPaise(earnings.totals.paid_amount_paise)} />
        <StatTile label="Total earned" value={formatPaise(earnings.totals.total_amount_paise)} />
      </div>

      {earnings.rows.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-12 text-center">
          <IndianRupee className="h-8 w-8 text-text-secondary" aria-hidden="true" />
          <p className="mt-3 font-medium text-text-primary">No commissions recorded yet.</p>
          <p className="mt-1 text-sm text-text-secondary">
            Commissions appear here once Admin records one against a deal you sourced.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {earnings.rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-text-primary">
                    {formatPaise(row.agreed_amount_paise)}
                  </span>
                  <Badge className={STATUS_STYLE[row.status] ?? "bg-muted text-text-secondary"}>
                    {STATUS_LABEL[row.status] ?? row.status}
                  </Badge>
                </div>
                <p className="truncate text-xs text-text-secondary">
                  {LINE_LABEL[row.business_line] ?? row.business_line}
                  {" · "}
                  {row.deal_type === "loan_application" ? "Loan" : "Property deal"}
                  {" · "}
                  {formatDate(row.created_at)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
