"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getLoanApplications, type LoanApplication } from "@/lib/loans";

import { DASHBOARD_ICONS } from "./dashboard-icons";
import { DashboardHeader, DashboardPage } from "./dashboard-ui";
import { FetchError } from "./fetch-error";
import { STATUS_STYLES, formatAmount, formatDate } from "./loan-format";

type Status = "loading" | "ready" | "error";

function ApplyCta({ className }: { className?: string }) {
  return (
    <Link
      href="/dashboard/explore/loans"
      className={cn(
        "inline-flex items-center gap-2 rounded-lg bg-loans-accent px-4 py-2 text-sm font-medium text-surface transition-colors hover:bg-loans-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-loans-accent focus-visible:ring-offset-2",
        className,
      )}
    >
      <DASHBOARD_ICONS.applyForLoan className="h-4 w-4" aria-hidden="true" />
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
      <DashboardPage className="space-y-5">
        <Skeleton className="h-9 w-48 rounded-lg" />
        <Skeleton className="h-64 rounded-2xl" />
      </DashboardPage>
    );
  }

  if (status === "error") {
    return (
      <DashboardPage>
        <FetchError status={errorStatus} message={error} onRetry={retry} />
      </DashboardPage>
    );
  }

  return (
    <DashboardPage>
      <DashboardHeader
        title="Your loan journey"
        description="Track applications, see their latest status, and start a new request."
        actions={<ApplyCta />}
      />

      {applications.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <h2 className="text-lg font-semibold text-text-primary">No loan applications yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
            When you apply, it shows up here right away with its live status, so you always know
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
                <th className="px-5 py-3">
                  <span className="sr-only">View</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {applications.map((a) => {
                const s = STATUS_STYLES[a.status];
                return (
                  <tr
                    key={a.id}
                    className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-5 py-4 font-medium">
                      <Link
                        href={`/dashboard/loans/${a.id}`}
                        className="text-text-primary transition-colors hover:text-loans-accent focus-visible:outline-none focus-visible:text-loans-accent"
                      >
                        {a.loanTypeLabel}
                      </Link>
                    </td>
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
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/dashboard/loans/${a.id}`}
                        aria-label={`View ${a.loanTypeLabel} details`}
                        className="inline-flex text-text-secondary transition-colors hover:text-loans-accent focus-visible:outline-none focus-visible:text-loans-accent"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </DashboardPage>
  );
}
