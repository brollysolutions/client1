"use client";

import Link from "next/link";
import { FileText, Plus } from "lucide-react";

import { cn } from "@/lib/utils";

// Shape the real endpoint will return (Phase 2). Kept here so the table is ready
// to render live data the moment the backend lands; today the list is empty.
export type LoanApplication = {
  id: string;
  product: string;
  amount: number;
  appliedOn: string; // ISO date
  status: "submitted" | "under_review" | "approved" | "rejected" | "disbursed";
};

const STATUS_STYLES: Record<LoanApplication["status"], { label: string; className: string }> = {
  submitted: { label: "Submitted", className: "bg-muted text-text-secondary" },
  under_review: { label: "Under review", className: "bg-warning/10 text-warning" },
  approved: { label: "Approved", className: "bg-success/10 text-success" },
  rejected: { label: "Rejected", className: "bg-error/10 text-error" },
  disbursed: { label: "Disbursed", className: "bg-loans-soft text-loans-accent" },
};

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function LoansApplications({ applications = [] }: { applications?: LoanApplication[] }) {
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Your loans</h1>
          <p className="text-sm text-text-secondary">
            Track every loan you have applied for and its status.
          </p>
        </div>
        <Link
          href="/dashboard/apply"
          className="inline-flex items-center gap-2 rounded-lg bg-loans-accent px-4 py-2 text-sm font-medium text-surface transition-colors hover:bg-loans-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-loans-accent focus-visible:ring-offset-2"
        >
          <Plus className="h-4 w-4" />
          Apply for a loan
        </Link>
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
          <Link
            href="/dashboard/apply"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-loans-accent px-4 py-2 text-sm font-medium text-surface transition-colors hover:bg-loans-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-loans-accent focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" />
            Apply for a loan
          </Link>
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
                    <td className="px-5 py-4 font-medium text-text-primary">{a.product}</td>
                    <td className="px-5 py-4 text-text-primary">{inr.format(a.amount)}</td>
                    <td className="hidden px-5 py-4 text-text-secondary sm:table-cell">
                      {formatDate(a.appliedOn)}
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
