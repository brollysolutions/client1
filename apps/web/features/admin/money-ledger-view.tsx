"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardPanel } from "@/features/dashboard/dashboard-ui";
import { DataTable, type DataColumn } from "@/features/dashboard/data-table";
import { FetchError } from "@/features/dashboard/fetch-error";
import {
  EMPTY_FILTERS,
  FilterBar,
  matchesSearch,
  type FilterBarValue,
  type FilterOption,
} from "@/features/dashboard/filter-bar";
import {
  ListEmptyState,
  ListLoadingState,
  ListPagination,
} from "@/features/dashboard/list-states";
import { useFilteredPage } from "@/features/dashboard/use-filtered-page";
import { isInDateRange } from "@/lib/date-range";

export type MoneyLedgerSection<Row> = {
  title: string;
  description: string;
  rows: readonly Row[];
  columns: readonly DataColumn<Row>[];
  rowKey: (row: Row) => string;
  searchText: (row: Row) => string;
  status?: (row: Row) => string;
  line?: (row: Row) => string | null | undefined;
  date?: (row: Row) => string | null | undefined;
  statusOptions?: readonly FilterOption[];
  statusLabel?: string;
  initialStatus?: string;
  onStatusChange?: (status: string) => void;
  searchLabel: string;
  searchPlaceholder: string;
  emptyIcon: LucideIcon;
  emptyTitle: string;
  emptyDescription?: string;
  minWidth?: string;
  action?: React.ReactNode;
  note?: string;
};

function sectionFilters(initialStatus?: string): FilterBarValue {
  return { ...EMPTY_FILTERS, status: initialStatus || "all" };
}

function MoneyLedgerTable<Row>({
  section,
  loading,
}: {
  section: MoneyLedgerSection<Row>;
  loading: boolean;
}) {
  const [filters, setFilters] = React.useState<FilterBarValue>(() =>
    sectionFilters(section.initialStatus),
  );

  React.useEffect(() => {
    setFilters((current) => ({ ...current, status: section.initialStatus || "all" }));
  }, [section.initialStatus]);

  const filtered = React.useMemo(
    () =>
      section.rows.filter((row) => {
        if (filters.search && !matchesSearch(section.searchText(row), filters.search)) return false;
        if (filters.status !== "all" && section.status?.(row) !== filters.status) return false;
        if (filters.line !== "all" && section.line?.(row) !== filters.line) return false;
        if (section.date && !isInDateRange(section.date(row), filters.from, filters.to)) return false;
        return true;
      }),
    [filters, section],
  );
  const page = useFilteredPage(filtered, filters);

  function updateFilters(next: FilterBarValue) {
    setFilters(next);
    if (next.status !== filters.status) {
      section.onStatusChange?.(next.status === "all" ? "" : next.status);
    }
  }

  return (
    <div className="space-y-4">
      <FilterBar
        value={filters}
        onChange={updateFilters}
        searchLabel={section.searchLabel}
        searchPlaceholder={section.searchPlaceholder}
        statusOptions={section.statusOptions}
        statusLabel={section.statusLabel}
        showStatus={section.status != null}
        showLine={section.line != null}
        showDates={section.date != null}
        note={section.note}
      />

      <DashboardPanel
        title={section.title}
        description={section.description}
        action={section.action}
        bodyClassName="p-0"
      >
        {loading ? (
          <div className="p-5">
            <ListLoadingState rows={7} />
          </div>
        ) : filtered.length === 0 ? (
          <ListEmptyState
            icon={section.emptyIcon}
            title={section.emptyTitle}
            description={section.emptyDescription}
            className="m-5"
          />
        ) : (
          <>
            <DataTable
              columns={section.columns}
              rows={page.pageRows}
              rowKey={section.rowKey}
              minWidth={section.minWidth}
            />
            <div className="px-5 pb-5">
              <ListPagination page={page.page} total={page.total} onPageChange={page.setPage} />
            </div>
          </>
        )}
      </DashboardPanel>
    </div>
  );
}

export function MoneyLedgerView<EligibleRow, LedgerRow>({
  eligible,
  ledger,
  eligibleTabLabel,
  ledgerTabLabel,
  loading,
  error,
  onRetry,
  dialogs,
}: {
  eligible?: MoneyLedgerSection<EligibleRow>;
  ledger: MoneyLedgerSection<LedgerRow>;
  eligibleTabLabel?: string;
  ledgerTabLabel?: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  dialogs?: React.ReactNode;
}) {
  if (error) return <FetchError status={null} message={error} onRetry={onRetry} />;

  return (
    <>
      {eligible ? (
        <Tabs defaultValue="eligible">
          <TabsList className="h-auto w-full justify-start overflow-x-auto">
            <TabsTrigger value="eligible">{eligibleTabLabel ?? "Eligible"}</TabsTrigger>
            <TabsTrigger value="ledger">{ledgerTabLabel ?? "Ledger"}</TabsTrigger>
          </TabsList>
          <TabsContent value="eligible" className="mt-4">
            <MoneyLedgerTable section={eligible} loading={loading} />
          </TabsContent>
          <TabsContent value="ledger" className="mt-4">
            <MoneyLedgerTable section={ledger} loading={loading} />
          </TabsContent>
        </Tabs>
      ) : (
        <MoneyLedgerTable section={ledger} loading={loading} />
      )}
      {dialogs}
    </>
  );
}
