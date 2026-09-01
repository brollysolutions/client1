"use client";

import { useRouter } from "next/navigation";
import { Inbox } from "lucide-react";

import { DataTable, DataTablePrimaryCell, type DataColumn } from "@/features/dashboard/data-table";
import { ListEmptyState } from "@/features/dashboard/list-states";
import { StatusBadge } from "@/features/dashboard/status-badge";
import { formatAge, formatDate } from "@/lib/format";

/**
 * The approval queue on both staff home pages.
 *
 * Admin's "Waiting on you" and Sub Admin's "Waiting on Admin" are the same
 * queue seen from the two ends of one approval, and the API returns the same
 * row shape for both — only the item kinds and their destinations differ. They
 * were two components rendering two copies of the same bordered link-card list,
 * inside a fixed-height scroll box that showed two or three rows at a time.
 *
 * Now: one full-width table. The rows carry how long each item has been
 * waiting, which is the fact the queue exists to communicate.
 */
export type PendingReviewRow = {
  id: string;
  kind: string;
  title: string;
  business_line: string;
  submitted_at: string;
};

export const REVIEW_LINE_LABEL: Record<string, string> = {
  loans: "Loans",
  real_estate: "Real Estate",
  both: "Both lines",
};

export function PendingReviewTable({
  items,
  kindLabel,
  kindHref,
  emptyTitle,
  emptyDescription,
}: {
  items: readonly PendingReviewRow[];
  kindLabel: Record<string, string>;
  /** Where a row of each kind sends the reviewer. */
  kindHref: Record<string, string>;
  emptyTitle: string;
  emptyDescription?: string;
}) {
  const router = useRouter();

  if (items.length === 0) {
    return (
      <ListEmptyState
        icon={Inbox}
        title={emptyTitle}
        description={emptyDescription}
        className="border-0 py-10"
      />
    );
  }

  const columns: DataColumn<PendingReviewRow>[] = [
    {
      key: "title",
      header: "Item",
      cellClassName: "max-w-[24rem]",
      render: (row) => <DataTablePrimaryCell title={row.title} />,
    },
    {
      key: "kind",
      header: "Type",
      render: (row) => <StatusBadge tone="info">{kindLabel[row.kind] ?? row.kind}</StatusBadge>,
    },
    {
      key: "business_line",
      header: "Business line",
      render: (row) => (
        <span className="text-text-secondary">
          {REVIEW_LINE_LABEL[row.business_line] ?? row.business_line}
        </span>
      ),
    },
    {
      key: "submitted_at",
      header: "Waiting",
      align: "right",
      render: (row) => (
        <span className="tabular-nums text-text-secondary" title={formatDate(row.submitted_at)}>
          {formatAge(row.submitted_at)}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={items}
      rowKey={(row) => `${row.kind}:${row.id}`}
      onRowClick={(row) => router.push(kindHref[row.kind] ?? "/dashboard")}
      rowActionLabel="Open review queue"
      minWidth="min-w-[640px]"
    />
  );
}
