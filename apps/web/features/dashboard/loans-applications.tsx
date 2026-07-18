"use client";

import * as React from "react";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getLoanApplications, type LoanApplication, type LoanStatus } from "@/lib/loans";

import { FetchError } from "./fetch-error";

const STATUS_STYLES: Record<LoanStatus, { label: string; className: string }> = {
  new: { label: "Submitted", className: "bg-muted text-text-secondary" },
  assigned: { label: "Assigned to an advisor", className: "bg-muted text-text-secondary" },
  contacted: { label: "Advisor reached out", className: "bg-muted text-text-secondary" },
  docs_collected: { label: "Documents collected", className: "bg-muted text-text-secondary" },
  submitted_to_bank: { label: "Under review", className: "bg-warning/10 text-warning" },
  sanctioned: { label: "Sanctioned", className: "bg-success/10 text-success" },
  disbursed: { label: "Disbursed", className: "bg-loans-soft text-loans-accent" },
  closed: { label: "Closed", className: "bg-muted text-text-secondary" },
  rejected: { label: "Rejected", className: "bg-error/10 text-error" },
  on_hold: { label: "On hold", className: "bg-warning/10 text-warning" },
};

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function formatAmount(value: string | null): string {
  if (!value) return "—";
  const n = Number(value);
  return Number.isNaN(n) ? "—" : inr.format(n);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

type Status = "loading" | "ready" | "error";

function ApplyCta({ className }: { className?: string }) {
  return (
    <Link
      href="/dashboard/apply"
      className={cn(
        "inline-flex items-center gap-2 rounded-lg bg-loans-accent px-4 py-2 text-sm font-medium text-surface transition-colors hover:bg-loans-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-loans-accent focus-visible:ring-offset-2",
        className,
      )}
    >
      <Plus className="h-4 w-4" />
      Apply for a loan
    </Link>
  );
}

export function LoansApplications() {
  const [applications, setApplications] = React.useState<LoanApplication[]>([]);
  const [status, setStatus] = React.useState<Status>("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [errorStatus, setErrorStatus] = React.useState<number | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const retry = React.useCallback(() => {
    setStatus("loading");
    setError(null);
    setErrorStatus(null);
    setReloadKey((k) => k + 1);
  }, []);

  React.useEffect(() => {
    let active = true;
    let retried = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      const res = await getLoanApplications();
      if (!active) return;
      if (res.ok) {
        setApplications(res.data);
        setStatus("ready");
        return;
      }
      // One automatic retry on a transient network failure before surfacing
      // the error, matching the me-provider pattern.
      if (res.status === 0 && !retried) {
        retried = true;
        timer = setTimeout(() => void run(), 1500);
        return;
      }
      setError(res.error);
      setErrorStatus(res.status);
      setStatus("error");
    };

    void run();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [reloadKey]);

  if (status === "loading") {
    return (
      <div className="space-y-5">
        <Skeleton className="h-9 w-48 rounded-lg" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (status === "error") {
    return <FetchError status={errorStatus} message={error} onRetry={retry} />;
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Your loans</h1>
          <p className="text-sm text-text-secondary">
            Track every loan you have applied for and its status.
          </p>
        </div>
        <ApplyCta />
      </div>

      {applications.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-loans-soft text-loans-accent">
            <FileText className="h-6 w-6" />
          </span>
          <h2 className="mt-5 text-lg font-semibold text-text-primary">No loan applications yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
            When you apply for a loan, it shows up here with its live status so you always know
            where things stand.
          </p>
          <ApplyCta className="mt-6" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="px-5 py-3 font-medium">Loan</th>
                <th className="px-5 py-3 font-medium">Amount</th>
                <th className="hidden px-5 py-3 font-medium sm:table-cell">Applied on</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((a) => {
                const s = STATUS_STYLES[a.status];
                return (
                  <tr key={a.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-4 font-medium text-text-primary">{a.loanTypeLabel}</td>
                    <td className="px-5 py-4 text-text-primary">
                      {formatAmount(a.amountSanctioned ?? a.amountRequested)}
                    </td>
                    <td className="hidden px-5 py-4 text-text-secondary sm:table-cell">
                      {formatDate(a.openedOn)}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                          s.className,
                        )}
                      >
                        {s.label}
                      </span>
                      {(a.status === "rejected" || a.status === "on_hold") && a.statusReason ? (
                        <p className="mt-1 text-xs text-text-secondary">{a.statusReason}</p>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
