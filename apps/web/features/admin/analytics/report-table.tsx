"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Inbox, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SortDir } from "@/lib/reports-api";

export type ReportColumn<Row> = {
  key: string; // maps 1:1 to the backend's sort_by whitelist for this report
  header: string;
  sortable?: boolean;
  align?: "left" | "right";
  render: (row: Row) => React.ReactNode;
};

// components/ui/ has no table.tsx -- every admin list in this app hand-rolls
// its own markup (loan-types-view.tsx builds a <ul> of row buttons). Grouped,
// sortable, multi-column data fits an actual <table> better than a <ul>, so
// this is the one reusable sortable table the four reports share, driven
// entirely by column defs rather than four near-duplicate components.
export function ReportTable<Row>({
  rows,
  columns,
  rowKey,
  sortBy,
  sortDir,
  onSort,
  loading,
  error,
  onRetry,
  emptyMessage,
}: {
  rows: Row[];
  columns: ReportColumn<Row>[];
  rowKey: (row: Row) => string;
  sortBy: string | undefined;
  sortDir: SortDir;
  onSort: (key: string) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  emptyMessage: string;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-border bg-card py-16">
        <Loader2 className="h-6 w-6 animate-spin text-brand-navy" aria-hidden="true" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-text-secondary">{error}</p>
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-12 text-center">
        <Inbox className="h-8 w-8 text-text-secondary" aria-hidden="true" />
        <p className="mt-3 font-medium text-text-primary">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key || col.header}
                scope="col"
                className={cn(
                  "px-4 py-3 font-medium text-text-secondary",
                  col.align === "right" ? "text-right" : "text-left",
                )}
              >
                {col.sortable ? (
                  <button
                    type="button"
                    onClick={() => onSort(col.key)}
                    className={cn(
                      "inline-flex items-center gap-1 hover:text-text-primary",
                      col.align === "right" && "flex-row-reverse",
                    )}
                  >
                    {col.header}
                    {sortBy === col.key ? (
                      sortDir === "desc" ? (
                        <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden="true" />
                    )}
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-border last:border-0">
              {columns.map((col) => (
                <td
                  key={col.key || col.header}
                  className={cn(
                    "px-4 py-3 text-text-primary",
                    col.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
