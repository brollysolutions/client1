// Shared loan presentation helpers, used by the Home list (loans-applications)
// and the detail/timeline view. Keeping the status labels + formatters in one
// place means the two surfaces never drift.

import type { FeeOutcome, LoanStatus } from "@/lib/loans";

export const STATUS_STYLES: Record<LoanStatus, { label: string; className: string }> = {
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

// The happy-path journey in order. on_hold and rejected sit off this line (a
// paused or ended application), so they are handled separately in the timeline.
export const PIPELINE: LoanStatus[] = [
  "new",
  "assigned",
  "contacted",
  "docs_collected",
  "submitted_to_bank",
  "sanctioned",
  "disbursed",
  "closed",
];

export const FEE_OUTCOME_LABEL: Record<FeeOutcome, string> = {
  waived: "Waived",
  cashback: "Cashback",
  none: "Standard",
};

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function formatAmount(value: string | null): string {
  if (!value) return "—";
  const n = Number(value);
  return Number.isNaN(n) ? "—" : inr.format(n);
}

export function formatRate(value: string | null): string {
  if (!value) return "—";
  const n = Number(value);
  return Number.isNaN(n) ? "—" : `${n}% p.a.`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
