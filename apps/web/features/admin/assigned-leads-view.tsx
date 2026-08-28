"use client";

import * as React from "react";
import { Users } from "lucide-react";

import { DashboardHeader, DashboardPage, DashboardPanel } from "@/features/dashboard/dashboard-ui";
import {
  DataTable,
  DataTablePrimaryCell,
  nextSort,
  type DataColumn,
  type SortState,
} from "@/features/dashboard/data-table";
import { FetchError } from "@/features/dashboard/fetch-error";
import {
  EMPTY_FILTERS,
  FilterBar,
  filtersAreActive,
  matchesSearch,
  type FilterBarValue,
} from "@/features/dashboard/filter-bar";
import { ListEmptyState, ListLoadingState, ListPagination } from "@/features/dashboard/list-states";
import { StatusBadge, type StatusTone } from "@/features/dashboard/status-badge";
import { useFilteredPage } from "@/features/dashboard/use-filtered-page";
import { isInDateRange } from "@/lib/date-range";
import { formatDate } from "@/lib/format";
import { formatMobile } from "@/lib/phone";
import type { AdminAssignedLead } from "@/lib/admin-api";

import { LeadDetailsDialog } from "./lead-details-dialog";
import { useAdminAssignedLeads } from "./use-admin-assigned-leads";

const LINE_LABEL: Record<string, string> = { loans: "Loans", real_estate: "Real Estate" };
const ORIGIN_LABEL: Record<string, string> = { direct: "Direct", agent: "Agent referral" };
const STATUS_LABEL: Record<string, string> = { assigned: "Assigned", working: "Working" };
const STATUS_TONE: Record<string, StatusTone> = { assigned: "info", working: "success" };

const STATUS_OPTIONS = [
  { value: "assigned", label: "Assigned" },
  { value: "working", label: "Working" },
];

const LINE_OPTIONS = [
  { value: "loans", label: "Loans" },
  { value: "real_estate", label: "Real Estate" },
];

export function AssignedLeadsView() {
  const { leads, loading, error, reload } = useAdminAssignedLeads();
  const [filters, setFilters] = React.useState<FilterBarValue>(EMPTY_FILTERS);
  const [sort, setSort] = React.useState<SortState>({ key: "created_at", dir: "desc" });
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const active = React.useMemo(
    () => leads.find((lead) => lead.id === activeId) ?? null,
    [activeId, leads],
  );

  const filtered = React.useMemo(() => {
    const rows = leads.filter((lead) => {
      if (filters.line !== "all" && lead.business_line !== filters.line) return false;
      if (filters.status !== "all" && lead.status !== filters.status) return false;
      if (!isInDateRange(lead.created_at, filters.from, filters.to)) return false;
      return matchesSearch(
        `${lead.name ?? ""} ${lead.mobile} ${lead.assigned_telecaller_name ?? ""} ${lead.assigned_telecaller_staff_code ?? ""}`,
        filters.search,
      );
    });
    const direction = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((left, right) => {
      const result =
        sort.key === "lead"
          ? (left.name ?? "").localeCompare(right.name ?? "")
          : sort.key === "telecaller"
            ? (left.assigned_telecaller_name ?? "").localeCompare(
                right.assigned_telecaller_name ?? "",
              )
            : sort.key === "status"
              ? left.status.localeCompare(right.status)
              : left.created_at.localeCompare(right.created_at);
      return result * direction || left.created_at.localeCompare(right.created_at);
    });
  }, [filters, leads, sort]);

  const { page, setPage, pageRows, total } = useFilteredPage(filtered, [filters, sort]);

  const columns: readonly DataColumn<AdminAssignedLead>[] = [
    {
      key: "lead",
      header: "Lead",
      sortable: true,
      cellClassName: "max-w-[18rem]",
      render: (lead) => (
        <DataTablePrimaryCell
          title={lead.name ?? "Unnamed lead"}
          subtitle={`${formatMobile(lead.mobile)} · ${ORIGIN_LABEL[lead.origin] ?? lead.origin}`}
        />
      ),
    },
    {
      key: "line",
      header: "Line",
      render: (lead) => (
        <span className="text-text-secondary">
          {LINE_LABEL[lead.business_line] ?? lead.business_line}
        </span>
      ),
    },
    {
      key: "telecaller",
      header: "Telecaller",
      sortable: true,
      render: (lead) =>
        lead.assigned_telecaller_name ? (
          <DataTablePrimaryCell
            title={lead.assigned_telecaller_name}
            subtitle={lead.assigned_telecaller_staff_code ?? undefined}
          />
        ) : (
          <span className="text-text-secondary">No active Telecaller attached</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (lead) => (
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge tone={STATUS_TONE[lead.status] ?? "neutral"}>
            {STATUS_LABEL[lead.status] ?? lead.status}
          </StatusBadge>
          {lead.assigned_telecaller_staff_profile_uuid ? null : (
            <StatusBadge tone="danger">Awaiting automatic repair</StatusBadge>
          )}
        </div>
      ),
    },
    {
      key: "created_at",
      header: "Created",
      sortable: true,
      align: "right",
      render: (lead) => (
        <span className="tabular-nums text-text-secondary">{formatDate(lead.created_at)}</span>
      ),
    },
  ];

  return (
    <DashboardPage>
      <DashboardHeader
        title="Lead assignments"
        description="Every customer lead and the Telecaller who owns it. Open a row to correct its details."
      />

      <FilterBar
        value={filters}
        onChange={setFilters}
        searchLabel="Search lead assignments"
        searchPlaceholder="Lead, mobile, or Telecaller"
        statusOptions={STATUS_OPTIONS}
        lineOptions={LINE_OPTIONS}
        dateFromLabel="Created from"
        dateToLabel="Created to"
      />

      {loading ? (
        <ListLoadingState />
      ) : error ? (
        <FetchError status={null} message={error} onRetry={() => void reload()} />
      ) : total === 0 ? (
        <ListEmptyState
          icon={Users}
          title={
            filtersAreActive(filters) ? "No leads match these filters" : "No assigned leads yet"
          }
          description={
            filtersAreActive(filters)
              ? "Try a different search, line, status, or date range."
              : "Leads assigned to a Telecaller will show up here."
          }
        />
      ) : (
        <DashboardPanel
          title="Assignments"
          description={
            filtersAreActive(filters) ? `${total} of ${leads.length} leads` : `${leads.length} leads`
          }
          bodyClassName="p-0"
        >
          <DataTable
            columns={columns}
            rows={pageRows}
            rowKey={(lead) => lead.id}
            sort={sort}
            onSortChange={(key) => setSort((current) => nextSort(current, key))}
            onRowClick={(lead) => setActiveId(lead.id)}
            rowActionLabel="Correct lead details"
            minWidth="min-w-[880px]"
          />
          <div className="px-5 pb-4">
            <ListPagination page={page} total={total} onPageChange={setPage} />
          </div>
        </DashboardPanel>
      )}

      {active ? (
        <LeadDetailsDialog
          key={active.id}
          leadId={active.id}
          leadName={active.name}
          open
          onOpenChange={(next) => !next && setActiveId(null)}
          onSaved={() => void reload()}
        />
      ) : null}
    </DashboardPage>
  );
}
