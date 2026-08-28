"use client";

import * as React from "react";
import { Home } from "lucide-react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
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
import { WORKSPACE_DIALOG_CLASS, WorkspaceDialogHeader, WorkspaceLayout } from "@/features/dashboard/workspace-dialog";
import {
  PropertyDealProgressControls,
  STATUS_LABEL,
  type PropertyDealStatus,
} from "@/features/property-deals/property-deal-progress-controls";
import { isInDateRange } from "@/lib/date-range";
import { formatDate, formatINR } from "@/lib/format";

import { useAdminPropertyDeals } from "./use-admin-property-deals";

const STATUS_TONE: Record<PropertyDealStatus, StatusTone> = {
  new: "warning",
  contacted: "info",
  site_visit_done: "info",
  negotiation: "info",
  booked: "success",
  agreement_signed: "success",
  closed: "neutral",
  rejected: "danger",
  on_hold: "warning",
};

const STATUS_OPTIONS = (Object.entries(STATUS_LABEL) as [PropertyDealStatus, string][]).map(
  ([value, label]) => ({ value, label }),
);

type Deal = ReturnType<typeof useAdminPropertyDeals>["deals"][number];

function money(value: string | null | undefined): string {
  return value ? formatINR(Number(value)) : "-";
}

export function PropertyDealsView() {
  const [filters, setFilters] = React.useState<FilterBarValue>(EMPTY_FILTERS);
  const [sort, setSort] = React.useState<SortState>({ key: "opened_at", dir: "desc" });
  const [activeId, setActiveId] = React.useState<string | null>(null);

  // Status is applied server-side by the hook; the rest filter in memory.
  const { deals, loading, error, reload, updateDeal } = useAdminPropertyDeals(
    filters.status === "all" ? undefined : (filters.status as PropertyDealStatus),
  );

  const filtered = React.useMemo(() => {
    const rows = deals.filter(
      (deal) =>
        isInDateRange(deal.opened_at, filters.from, filters.to) &&
        (filters.line === "all" || deal.business_line === filters.line) &&
        matchesSearch(`${deal.property_title} ${deal.customer_code}`, filters.search),
    );
    const direction = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sort.key) {
        case "property_title":
          return a.property_title.localeCompare(b.property_title) * direction;
        case "price_quoted":
          return (Number(a.price_quoted ?? 0) - Number(b.price_quoted ?? 0)) * direction;
        case "status":
          return a.status.localeCompare(b.status) * direction;
        default:
          return (new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime()) * direction;
      }
    });
  }, [deals, filters, sort]);

  const { page, setPage, pageRows, total } = useFilteredPage(filtered, filters);
  const active = activeId ? deals.find((deal) => deal.id === activeId) ?? null : null;

  const columns: DataColumn<Deal>[] = [
    {
      key: "property_title",
      header: "Property",
      sortable: true,
      cellClassName: "max-w-[22rem]",
      render: (deal) => (
        <DataTablePrimaryCell title={deal.property_title} subtitle={deal.customer_code} />
      ),
    },
    {
      key: "price_quoted",
      header: "Quoted",
      sortable: true,
      align: "right",
      render: (deal) => (
        <span className="tabular-nums text-text-primary">{money(deal.price_quoted)}</span>
      ),
    },
    {
      key: "booking_amount",
      header: "Booking",
      align: "right",
      render: (deal) => (
        <span className="tabular-nums text-text-secondary">{money(deal.booking_amount)}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (deal) => (
        <StatusBadge tone={STATUS_TONE[deal.status] ?? "neutral"}>
          {STATUS_LABEL[deal.status] ?? deal.status}
        </StatusBadge>
      ),
    },
    {
      key: "opened_at",
      header: "Opened",
      sortable: true,
      align: "right",
      render: (deal) => (
        <span className="tabular-nums text-text-secondary">{formatDate(deal.opened_at)}</span>
      ),
    },
  ];

  return (
    <DashboardPage>
      <DashboardHeader
        title="Property deals"
        description="Track every real-estate deal through site visit, negotiation, and booking."
      />

      <FilterBar
        value={filters}
        onChange={setFilters}
        searchLabel="Search property deals"
        searchPlaceholder="Property or customer"
        statusOptions={STATUS_OPTIONS}
        lineOptions={[
          { value: "loans", label: "Loans" },
          { value: "real_estate", label: "Real Estate" },
        ]}
        dateFromLabel="Opened from"
        dateToLabel="Opened to"
      />

      {loading ? (
        <ListLoadingState />
      ) : error ? (
        <FetchError status={null} message={error} onRetry={() => void reload()} />
      ) : total === 0 ? (
        <ListEmptyState
          icon={Home}
          title={filtersAreActive(filters) ? "No deals match these filters" : "No property deals yet"}
          description={
            filtersAreActive(filters)
              ? "Try a different search, status, line, or date range."
              : "Deals telecallers open against real-estate leads will show up here."
          }
        />
      ) : (
        <DashboardPanel
          title="Deals"
          description={
            filtersAreActive(filters) ? `${total} of ${deals.length} deals` : `${deals.length} deals`
          }
          bodyClassName="p-0"
        >
          <DataTable
            columns={columns}
            rows={pageRows}
            rowKey={(deal) => deal.id}
            sort={sort}
            onSortChange={(key) => setSort((current) => nextSort(current, key))}
            onRowClick={(deal) => setActiveId(deal.id)}
            rowActionLabel="Open deal"
            minWidth="min-w-[820px]"
          />
          <div className="px-5 pb-4">
            <ListPagination page={page} total={total} onPageChange={setPage} />
          </div>
        </DashboardPanel>
      )}

      <Dialog open={active !== null} onOpenChange={(open) => !open && setActiveId(null)}>
        <DialogContent showCloseButton={false} className={WORKSPACE_DIALOG_CLASS}>
          {active ? (
            <>
              <WorkspaceDialogHeader
                title={active.property_title}
                description={`${active.customer_code} · opened ${formatDate(active.opened_at)}`}
                actions={
                  <StatusBadge tone={STATUS_TONE[active.status] ?? "neutral"}>
                    {STATUS_LABEL[active.status] ?? active.status}
                  </StatusBadge>
                }
                closeLabel="Close deal"
              />
              <WorkspaceLayout
                editor={
                  <div className="mx-auto w-full max-w-3xl">
                    <PropertyDealProgressControls
                      deal={active}
                      onUpdate={(payload) => updateDeal(active.id, payload)}
                    />
                  </div>
                }
              />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </DashboardPage>
  );
}
