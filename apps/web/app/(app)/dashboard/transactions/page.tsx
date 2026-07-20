"use client";

import { ArrowDownLeft, Gift, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

// Frontend-only preview. Payment/payout infrastructure does not exist yet, so
// this ledger renders sample rows to show the intended layout. Clearly labeled as
// sample data so it never reads as a live balance.
type Txn = {
  id: string;
  date: string;
  label: string;
  type: "cashback" | "referral";
  amount: number;
  status: "paid" | "processing";
};

const SAMPLE: Txn[] = [
  { id: "1", date: "2026-07-12", label: "Cashback on disbursed home loan", type: "cashback", amount: 5000, status: "paid" },
  { id: "2", date: "2026-06-28", label: "Referral payout for Rohit S.", type: "referral", amount: 1500, status: "paid" },
  { id: "3", date: "2026-06-15", label: "Referral payout for Meera K.", type: "referral", amount: 1500, status: "processing" },
  { id: "4", date: "2026-05-30", label: "Cashback on personal loan", type: "cashback", amount: 2500, status: "paid" },
];

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function TransactionsPage() {
  const total = SAMPLE.filter((t) => t.status === "paid").reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Transactions</h1>
          <p className="text-sm text-text-secondary">
            Your cashback and referral payouts, all in one place.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-text-secondary">
          <Sparkles className="h-3.5 w-3.5" />
          Sample data
        </span>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
          Total paid out
        </p>
        <p className="mt-1 text-3xl font-semibold text-text-primary">{inr.format(total)}</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
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
            {SAMPLE.map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-loans-soft text-loans-accent">
                      {t.type === "cashback" ? (
                        <ArrowDownLeft className="h-4 w-4" />
                      ) : (
                        <Gift className="h-4 w-4" />
                      )}
                    </span>
                    <span className="font-medium text-text-primary">{t.label}</span>
                  </div>
                </td>
                <td className="hidden px-5 py-4 text-text-secondary sm:table-cell">
                  {formatDate(t.date)}
                </td>
                <td className="px-5 py-4 font-medium text-text-primary">{inr.format(t.amount)}</td>
                <td className="px-5 py-4">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                      t.status === "paid"
                        ? "bg-success/10 text-success"
                        : "bg-warning/10 text-warning",
                    )}
                  >
                    {t.status === "paid" ? "Paid" : "Processing"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
