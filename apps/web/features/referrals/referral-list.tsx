"use client";

import { Users } from "lucide-react";

import { formatPaise } from "@/lib/format";
import { ListPagination, useListPagination } from "@/features/dashboard/list-pagination";
import type { Referral } from "@/lib/referrals-api";
import { cn } from "@/lib/utils";

// Exported so features/admin/referral-payouts-view.tsx can reuse the exact
// same status vocabulary instead of drifting a second copy.
export const LINE_LABEL: Record<string, string> = {
  loans: "Loans",
  real_estate: "Real Estate",
  both: "Both lines",
};

export const STATUS_STYLE: Record<string, string> = {
  pending: "bg-warning/10 text-warning",
  converted: "bg-muted text-text-secondary",
  accrued: "bg-success/10 text-success",
  paid: "bg-success/10 text-success",
  void: "bg-destructive/10 text-destructive",
};

export const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  converted: "Converted",
  accrued: "Bonus accrued",
  paid: "Paid",
  void: "Not eligible",
};

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function ReferralList({ referrals, embedded = false }: { referrals: Referral[]; embedded?: boolean }) {
  const { page, pageItems, setPage } = useListPagination(referrals);

  if (referrals.length === 0) {
    return (
      <div className={cn("rounded-2xl border border-dashed border-border px-6 py-14 text-center", embedded ? "bg-muted/20" : "bg-card")}>
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-text-secondary">
          <Users className="h-6 w-6" />
        </span>
        <h2 className="mt-5 text-lg font-semibold text-text-primary">No referrals yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
          Share your code above. Referrals you make will show up here once someone signs up with
          it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
    <div className={cn("overflow-x-auto", !embedded && "rounded-xl border border-border bg-card")}>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
          <tr>
            <th className="px-5 py-3 font-medium">Referred</th>
            <th className="hidden px-5 py-3 font-medium sm:table-cell">Line</th>
            <th className="px-5 py-3 font-medium">Status</th>
            <th className="px-5 py-3 font-medium">Bonus</th>
            <th className="hidden px-5 py-3 font-medium sm:table-cell">Date</th>
          </tr>
        </thead>
        <tbody>
          {pageItems.map((r) => (
            <tr key={r.id} className="border-b border-border last:border-0">
              <td className="px-5 py-4 font-medium text-text-primary">
                {r.referred_mobile_masked}
              </td>
              <td className="hidden px-5 py-4 text-text-secondary sm:table-cell">
                {r.business_line ? (LINE_LABEL[r.business_line] ?? r.business_line) : "-"}
              </td>
              <td className="px-5 py-4">
                <span
                  className={cn(
                    "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                    STATUS_STYLE[r.conversion_status] ?? "bg-muted text-text-secondary",
                  )}
                >
                  {STATUS_LABEL[r.conversion_status] ?? r.conversion_status}
                </span>
              </td>
              <td className="px-5 py-4 text-text-primary">
                {r.bonus_amount_paise != null ? formatPaise(r.bonus_amount_paise) : "-"}
              </td>
              <td className="hidden px-5 py-4 text-text-secondary sm:table-cell">
                {formatDate(r.converted_at ?? r.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <ListPagination page={page} total={referrals.length} onPageChange={setPage} label="Referrals pages" />
    </div>
  );
}
