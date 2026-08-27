"use client";

import * as React from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DASHBOARD_ICONS } from "@/features/dashboard/dashboard-icons";
import {
  DashboardHeader,
  DashboardPage,
  DashboardPanel,
  MetricCard,
} from "@/features/dashboard/dashboard-ui";
import { FetchError } from "@/features/dashboard/fetch-error";
import { ListPagination, useListPagination } from "@/features/dashboard/list-pagination";
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

export function AgentEarningsView() {
  const { earnings, status, error, errorStatus, retry } = useAgentEarnings();
  const rows = earnings?.rows ?? [];
  const { page, pageItems, setPage } = useListPagination(rows);

  if (status === "loading") {
    return (
      <DashboardPage className="space-y-5">
        <Skeleton className="h-9 w-48 rounded-lg" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </DashboardPage>
    );
  }

  if (status === "error" || !earnings) {
    return (
      <DashboardPage>
        <FetchError status={errorStatus} message={error} onRetry={retry} />
      </DashboardPage>
    );
  }

  return (
    <DashboardPage>
      <DashboardHeader title="Earnings" description="Commissions Admin has recorded against your deals." />

      {/* 3 metrics, not 4 — every other MetricGrid usage in the app has
          exactly 4 cards to fill its sm:2/xl:4 grid evenly; a 3-card grid
          would leave an uneven row, so this panel gets its own 3-column grid
          instead, reusing MetricCard for the shared card styling/tokens. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Pending"
          value={formatPaise(earnings.totals.pending_amount_paise)}
          icon={DASHBOARD_ICONS.earnings}
        />
        <MetricCard
          label="Paid"
          value={formatPaise(earnings.totals.paid_amount_paise)}
          icon={DASHBOARD_ICONS.earnings}
        />
        <MetricCard
          label="Total earned"
          value={formatPaise(earnings.totals.total_amount_paise)}
          icon={DASHBOARD_ICONS.earnings}
        />
      </div>

      {earnings.rows.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-text-secondary">
            <DASHBOARD_ICONS.earnings className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="mt-5 text-lg font-semibold text-text-primary">No commissions recorded yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
            Commissions appear here once Admin records one against a deal you sourced.
          </p>
        </div>
      ) : (
        <DashboardPanel title="Commission history" description="Deals Admin has recorded a commission against.">
          <ul className="space-y-3">
            {pageItems.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
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
                {row.status === "paid" && row.payout_txn_uuid ? (
                  <Link
                    href="/dashboard/transactions"
                    className="shrink-0 text-sm font-medium text-brand-cta hover:underline"
                  >
                    View in transactions
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
          <ListPagination page={page} total={rows.length} onPageChange={setPage} label="Commission history pages" />
        </DashboardPanel>
      )}
    </DashboardPage>
  );
}
