"use client";

import * as React from "react";
import { ArrowDownLeft, Coins, Gift, Undo2, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { FetchError } from "@/features/dashboard/fetch-error";
import { DASHBOARD_ICONS } from "@/features/dashboard/dashboard-icons";
import { DashboardHeader, DashboardPage, DashboardPanel, MetricCard, MetricGrid } from "@/features/dashboard/dashboard-ui";
import { formatPaise } from "@/lib/format";
import {
  getTransactions,
  type Transaction,
  type TransactionStatus,
  type TransactionType,
} from "@/lib/transactions";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<TransactionType, LucideIcon> = {
  cashback: ArrowDownLeft,
  referral_bonus: Gift,
  commission: Coins,
};

const STATUS_STYLE: Record<TransactionStatus, string> = {
  paid: "bg-success/10 text-success",
  processing: "bg-warning/10 text-warning",
  pending: "bg-warning/10 text-warning",
  failed: "bg-destructive/10 text-destructive",
};

const STATUS_LABEL: Record<TransactionStatus, string> = {
  paid: "Paid",
  processing: "Processing",
  pending: "Pending",
  failed: "Failed",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

type Status = "loading" | "ready" | "error";

// Payout ledger (cashback / referral / commission) backed by the real
// transactions API. No producers exist yet (a separate money-layer milestone
// writes rows), so a fresh account legitimately sees the empty state below.
export default function TransactionsPage() {
  const [transactions, setTransactions] = React.useState<Transaction[]>([]);
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
    const run = async () => {
      const res = await getTransactions();
      if (!active) return;
      if (res.ok) {
        setTransactions(res.data);
        setStatus("ready");
        return;
      }
      setError(res.error);
      setErrorStatus(res.status);
      setStatus("error");
    };
    void run();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const totalPaidPaise = transactions
    .filter((t) => t.status === "paid")
    .reduce((sum, t) => sum + t.amountPaise, 0);
  const processingCount = transactions.filter((transaction) =>
    ["pending", "processing"].includes(transaction.status),
  ).length;
  const referralCount = transactions.filter(
    (transaction) => transaction.type === "referral_bonus",
  ).length;

  return (
    <DashboardPage>
      <DashboardHeader
        eyebrow="Financial activity"
        title="Transactions"
        description="Track cashback, referral bonuses, commissions, and any settlement reversals."
      />

      {status === "loading" ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : status === "error" ? (
        <FetchError status={errorStatus} message={error} onRetry={retry} />
      ) : transactions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-text-secondary">
            <Wallet className="h-6 w-6" />
          </span>
          <h2 className="mt-5 text-lg font-semibold text-text-primary">No transactions yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
            Your cashback, referral, and commission payouts will appear here once processed.
          </p>
        </div>
      ) : (
        <>
          <MetricGrid>
            <MetricCard label="Total paid" value={formatPaise(totalPaidPaise)} icon={DASHBOARD_ICONS.earnings} />
            <MetricCard label="Transactions" value={transactions.length} icon={DASHBOARD_ICONS.transactions} />
            <MetricCard label="Processing" value={processingCount} icon={Wallet} attention={processingCount > 0} />
            <MetricCard label="Referral rewards" value={referralCount} icon={DASHBOARD_ICONS.referrals} />
          </MetricGrid>

          <DashboardPanel title="Transaction history" description="A read-only ledger of your reward and payout activity.">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
                <tr>
                  <th className="px-5 py-3 font-medium">Detail</th>
                  <th className="hidden px-5 py-3 font-medium sm:table-cell">Date</th>
                  <th className="px-5 py-3 font-medium">Amount</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => {
                  // A clawback (post-settlement reversal, e.g. a bank-side
                  // reject days after payout) posts as a negative-amount row
                  // with the same "paid" status as a normal credit — flag it
                  // separately so it never reads as a fresh payout.
                  const isReversal = t.amountPaise < 0;
                  const Icon = isReversal ? Undo2 : TYPE_ICON[t.type];
                  return (
                    <tr key={t.id} className="border-b border-border last:border-0">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                              isReversal
                                ? "bg-destructive/10 text-destructive"
                                : "bg-loans-soft text-loans-accent",
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="font-medium text-text-primary">{t.description}</span>
                        </div>
                      </td>
                      <td className="hidden px-5 py-4 text-text-secondary sm:table-cell">
                        {formatDate(t.createdAt)}
                      </td>
                      <td
                        className={cn(
                          "px-5 py-4 font-medium",
                          isReversal ? "text-destructive" : "text-text-primary",
                        )}
                      >
                        {formatPaise(t.amountPaise)}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                            isReversal ? "bg-destructive/10 text-destructive" : STATUS_STYLE[t.status],
                          )}
                        >
                          {isReversal ? "Reversed" : STATUS_LABEL[t.status]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </DashboardPanel>
        </>
      )}
    </DashboardPage>
  );
}
