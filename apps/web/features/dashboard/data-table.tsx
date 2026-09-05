"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The one table every staff list renders through.
 *
 * `components/ui/` has no `table.tsx`, so before this existed each admin and
 * sub-admin surface hand-rolled either its own `<table>` or a `<ul>` of
 * full-width `<button>` cards, and three different row-interaction models
 * coexisted (accordion expand, open-a-dialog, dead row with side buttons). The
 * markup here is lifted from the telecaller leads table, which is the version
 * that went through design review most recently.
 *
 * Sorting is intentionally *controlled*: this component renders the header
 * affordance and reports the next sort state, but the caller sorts its own rows.
 * Row data comes from a dozen unrelated shapes, and several surfaces sort
 * server-side, so owning a comparator here would only ever be half-right.
 *
 * Passing `onRowClick` is what makes a row clickable — it adds `role="link"`,
 * keyboard activation, the pointer cursor, the accent-coloured hover, and the
 * trailing chevron column. A table without it renders as plain read-only data,
 * which is the honest presentation for surfaces like operational records.
 */
export type DataColumn<Row> = {
  key: string;
  header: string;
  /** Enables the sort affordance on this column's header. */
  sortable?: boolean;
  align?: "left" | "right";
  /** Applied to every `<td>` in the column — width and truncation live here. */
  cellClassName?: string;
  render: (row: Row) => React.ReactNode;
};

export type SortState = { key: string; dir: "asc" | "desc" };

/** Toggles direction when the same column is re-picked, else sorts ascending. */
export function nextSort(current: SortState, key: string): SortState {
  return current.key === key
    ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
    : { key, dir: "asc" };
}

function SortableHeader({
  column,
  sort,
  onSortChange,
}: {
  column: { key: string; header: string; align?: "left" | "right" };
  sort: SortState;
  onSortChange: (key: string) => void;
}) {
  const active = sort.key === column.key;
  const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      scope="col"
      className="p-0 font-medium"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      {/* Full-cell button rather than just the label, so the sort control's hit
          target matches the cell instead of the text's line-height. */}
      <button
        type="button"
        onClick={() => onSortChange(column.key)}
        className={cn(
          "group flex w-full items-center gap-1.5 px-5 py-3 text-xs font-medium uppercase tracking-wide text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue",
          column.align === "right" && "justify-end",
        )}
      >
        {column.header}
        <Icon
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-colors",
            active ? "text-brand-cta" : "text-text-secondary/70 group-hover:text-text-secondary",
          )}
          aria-hidden="true"
        />
      </button>
    </th>
  );
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  sort,
  onSortChange,
  onRowClick,
  rowActionLabel = "Open",
  minWidth,
  className,
}: {
  columns: readonly DataColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  sort?: SortState;
  onSortChange?: (key: string) => void;
  /** Supplying this makes rows clickable and adds the trailing chevron. */
  onRowClick?: (row: Row) => void;
  /** Screen-reader label for the trailing affordance column. */
  rowActionLabel?: string;
  /** e.g. "min-w-[720px]" when the columns cannot compress further. */
  minWidth?: string;
  className?: string;
}) {
  const interactive = onRowClick != null;

  return (
    <div className={cn("animate-in fade-in-0 overflow-visible duration-200 motion-reduce:animate-none xl:overflow-x-auto", className)}>
      {sort && onSortChange ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3 xl:hidden" role="group" aria-label="Sort records">
          <span className="text-xs text-text-secondary">Sort by</span>
          {columns.filter((column) => column.sortable).map((column) => (
            <button
              key={column.key}
              type="button"
              aria-label={`Sort by ${column.header}${sort.key === column.key ? `, ${sort.dir === "asc" ? "ascending" : "descending"}` : ""}`}
              aria-pressed={sort.key === column.key}
              onClick={() => onSortChange(column.key)}
              className="inline-flex min-h-11 max-w-full items-center gap-1 rounded-md border border-border px-3 py-2 text-sm text-text-secondary aria-pressed:bg-brand-cta-tint aria-pressed:text-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
            >
              {column.header}
              {sort.key === column.key ? (sort.dir === "asc" ? <ArrowUp className="h-4 w-4 shrink-0" aria-hidden /> : <ArrowDown className="h-4 w-4 shrink-0" aria-hidden />) : null}
            </button>
          ))}
        </div>
      ) : null}
      <table className={cn("block w-full text-left text-sm max-xl:!min-w-0 xl:table", minWidth)}>
        <thead className="hidden border-b border-border text-text-secondary xl:table-header-group">
          <tr>
            {columns.map((column) =>
              column.sortable && sort && onSortChange ? (
                <SortableHeader
                  key={column.key}
                  column={column}
                  sort={sort}
                  onSortChange={onSortChange}
                />
              ) : (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    "px-5 py-3 text-xs font-medium uppercase tracking-wide text-text-secondary",
                    column.align === "right" && "text-right",
                  )}
                >
                  {column.header}
                </th>
              ),
            )}
            {interactive ? (
              // No header label — this column only ever holds the chevron every
              // row ends in, so it is not sortable and not announced.
              <th scope="col" className="w-10 px-3 py-3">
                <span className="sr-only">{rowActionLabel}</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className="grid gap-3 p-3 xl:table-row-group xl:p-0">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              {...(interactive
                ? {
                    role: "link",
                    tabIndex: 0,
                    onClick: (event: React.MouseEvent<HTMLTableRowElement>) => {
                      const nestedControl = (event.target as HTMLElement).closest(
                        "a, button, input, select, textarea, [role='button'], [role='link']",
                      );
                      if (nestedControl && nestedControl !== event.currentTarget) return;
                      onRowClick(row);
                    },
                    onKeyDown: (event: React.KeyboardEvent<HTMLTableRowElement>) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onRowClick(row);
                      }
                    },
                  }
                : {})}
              className={cn(
                "group block rounded-xl border border-border bg-card transition-colors xl:table-row xl:rounded-none xl:border-x-0 xl:border-t-0 xl:bg-transparent xl:last:border-b-0",
                interactive &&
                  "cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue",
              )}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  data-label={column.header}
                  className={cn(
                    "grid min-w-0 grid-cols-1 gap-1 px-4 py-2 align-middle before:text-xs before:font-medium before:uppercase before:tracking-wide before:text-text-secondary before:content-[attr(data-label)] first:pt-4 last:pb-4 sm:grid-cols-[minmax(7rem,0.4fr)_minmax(0,1fr)] sm:gap-3 xl:table-cell xl:px-5 xl:py-4 xl:before:content-none max-xl:!max-w-none max-xl:whitespace-normal",
                    column.align === "right" && "text-right",
                    column.align === "right" && "max-xl:text-left",
                    column.cellClassName,
                  )}
                >
                  <div className="min-w-0 [overflow-wrap:anywhere]">{column.render(row)}</div>
                </td>
              ))}
              {interactive ? (
                <td className="hidden px-3 py-4 xl:table-cell">
                  <ChevronRight
                    className="h-4 w-4 text-text-secondary/60 transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-brand-cta motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                    aria-hidden="true"
                  />
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The primary cell of a clickable row: a title that picks up the accent colour
 * on row hover, with optional secondary text under it. Extracted because every
 * queue's first column is this exact shape.
 */
export function DataTablePrimaryCell({
  title,
  subtitle,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate max-xl:whitespace-normal max-xl:[overflow-wrap:anywhere] font-medium text-text-primary transition-colors group-hover:text-brand-cta">
        {title}
      </p>
      {subtitle ? <p className="truncate max-xl:whitespace-normal max-xl:[overflow-wrap:anywhere] text-xs text-text-secondary">{subtitle}</p> : null}
    </div>
  );
}
