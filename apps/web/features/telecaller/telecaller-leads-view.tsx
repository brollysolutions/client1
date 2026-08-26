"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, PhoneCall, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardHeader, DashboardPage, DashboardPanel } from "@/features/dashboard/dashboard-ui";
import { useLine } from "@/features/dashboard/line-provider";
import { FetchError } from "@/features/dashboard/fetch-error";
import { formatMobile } from "@/lib/phone";
import { cn } from "@/lib/utils";

import {
  DEFAULT_TELECALLER_LEAD_FILTERS,
  DEFAULT_TELECALLER_LEAD_SORT,
  filterTelecallerLeads,
  sortTelecallerLeads,
  type TelecallerLeadFilters,
  type TelecallerLeadSort,
  type TelecallerLeadSortKey,
} from "./telecaller-lead-filters";
import { DISPOSITION_LABEL, STATUS_LABEL, STATUS_STYLE, formatDateTime } from "./telecaller-lead-status";
import { useTelecallerLeads } from "./use-telecaller-leads";

const STATUS_FILTER_OPTIONS = ["new", "assigned", "working", "converted", "closed", "released"] as const;

const COLUMNS: { key: TelecallerLeadSortKey; label: string }[] = [
  { key: "name", label: "Lead" },
  { key: "status", label: "Status" },
  { key: "last_disposition", label: "Last disposition" },
  { key: "next_follow_up_at", label: "Next follow-up" },
];

function SortableHeader({
  column,
  sort,
  onSort,
}: {
  column: { key: TelecallerLeadSortKey; label: string };
  sort: TelecallerLeadSort;
  onSort: (key: TelecallerLeadSortKey) => void;
}) {
  const active = sort.key === column.key;
  const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      className="p-0 font-medium"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      {/* Full-cell button, not just the label — keeps the sort control's hit
          target at a comfortable size rather than the label text's own
          line-height. */}
      <button
        type="button"
        onClick={() => onSort(column.key)}
        className="group flex w-full items-center gap-1.5 px-5 py-3 text-xs font-medium uppercase tracking-wide text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue"
      >
        {column.label}
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

// The telecaller's assigned-lead list. Row click opens the lead detail page,
// where a call gets logged and status/requirement updated.
export function TelecallerLeadsView() {
  const router = useRouter();
  const { activeLine } = useLine();
  const { items, loading, error, reload } = useTelecallerLeads();
  const [filters, setFilters] = React.useState<TelecallerLeadFilters>(DEFAULT_TELECALLER_LEAD_FILTERS);
  const [sort, setSort] = React.useState<TelecallerLeadSort>(DEFAULT_TELECALLER_LEAD_SORT);

  const filtered = React.useMemo(() => filterTelecallerLeads(items, filters), [items, filters]);
  const sorted = React.useMemo(() => sortTelecallerLeads(filtered, sort), [filtered, sort]);

  const filtersActive =
    filters.search !== "" || filters.status !== "all" || filters.followUpFrom !== "" || filters.followUpTo !== "";

  function onSort(key: TelecallerLeadSortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  function clearFilters() {
    setFilters(DEFAULT_TELECALLER_LEAD_FILTERS);
  }

  return (
    <DashboardPage>
      <DashboardHeader
        eyebrow={activeLine === "real_estate" ? "Real Estate pipeline" : "Loans pipeline"}
        title="Leads"
        description="Leads assigned to you. Open one to log a call."
      />

      {loading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : error ? (
        <FetchError status={null} message={error} onRetry={() => void reload()} />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-text-secondary">
            <PhoneCall className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="mt-5 text-lg font-semibold text-text-primary">No leads assigned yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
            Leads assigned to you by Admin will show up here.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              aria-label="Search leads"
              placeholder="Name or mobile"
              value={filters.search}
              maxLength={100}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            />
            <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}>
              <SelectTrigger aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUS_FILTER_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              aria-label="Follow-up from date"
              type="date"
              value={filters.followUpFrom}
              onChange={(e) => setFilters((f) => ({ ...f, followUpFrom: e.target.value }))}
            />
            <Input
              aria-label="Follow-up to date"
              type="date"
              min={filters.followUpFrom || undefined}
              value={filters.followUpTo}
              onChange={(e) => setFilters((f) => ({ ...f, followUpTo: e.target.value }))}
            />
          </div>

          {sorted.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-text-secondary">
                <PhoneCall className="h-6 w-6" aria-hidden="true" />
              </span>
              <h2 className="mt-5 text-lg font-semibold text-text-primary">No leads match your filters</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
                Try a different search, status, or follow-up range.
              </p>
              {filtersActive ? (
                <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                  <X className="h-4 w-4" aria-hidden="true" />
                  Clear filters
                </Button>
              ) : null}
            </div>
          ) : (
            <DashboardPanel
              title="Assigned leads"
              description={
                filtersActive ? `${sorted.length} of ${items.length} leads` : `${items.length} leads`
              }
              action={
                filtersActive ? (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <X className="h-4 w-4" aria-hidden="true" />
                    Clear filters
                  </Button>
                ) : undefined
              }
            >
              <div className="animate-in fade-in-0 overflow-x-auto duration-200 motion-reduce:animate-none">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border text-text-secondary">
                    <tr>
                      {COLUMNS.map((column) => (
                        <SortableHeader key={column.key} column={column} sort={sort} onSort={onSort} />
                      ))}
                      {/* Trailing affordance column — no header label, just the
                          chevron every row ends in, so it isn't sortable. */}
                      <th className="w-10 px-3 py-3">
                        <span className="sr-only">Open lead</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((lead) => (
                      <tr
                        key={lead.id}
                        role="link"
                        tabIndex={0}
                        onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") router.push(`/dashboard/leads/${lead.id}`);
                        }}
                        className="group cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue"
                      >
                        <td className="px-5 py-4">
                          <p className="font-medium text-text-primary transition-colors group-hover:text-brand-cta">
                            {lead.name ?? "Unnamed lead"}
                          </p>
                          <p className="text-xs text-text-secondary">{formatMobile(lead.mobile)}</p>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                              STATUS_STYLE[lead.status] ?? "bg-muted text-text-secondary",
                            )}
                          >
                            {STATUS_LABEL[lead.status] ?? lead.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-text-secondary">
                          {lead.last_disposition ? DISPOSITION_LABEL[lead.last_disposition] : "Not called yet"}
                        </td>
                        <td className="px-5 py-4 text-text-secondary">{formatDateTime(lead.next_follow_up_at)}</td>
                        <td className="px-3 py-4">
                          <ChevronRight
                            className="h-4 w-4 text-text-secondary/60 transition-all group-hover:translate-x-0.5 group-hover:text-brand-cta"
                            aria-hidden="true"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DashboardPanel>
          )}
        </>
      )}
    </DashboardPage>
  );
}
