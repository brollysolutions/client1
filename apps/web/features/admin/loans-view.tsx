"use client";

import * as React from "react";
import { Inbox } from "lucide-react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DashboardHeader,
  DashboardPage,
  DashboardPanel,
} from "@/features/dashboard/dashboard-ui";
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
import {
  WORKSPACE_DIALOG_CLASS,
  WorkspaceDialogHeader,
  WorkspaceLayout,
} from "@/features/dashboard/workspace-dialog";
import { LoanProgressForm } from "@/features/loans/loan-progress-form";
import { FormAnswerSummary } from "@/features/loans/form-answer-summary";
import type { AdminLoanApplication } from "@/lib/admin-api";
import { isInDateRange } from "@/lib/date-range";
import { formatDate, formatINR } from "@/lib/format";

import { useAdminLoans } from "./use-admin-loans";

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  assigned: "Assigned",
  contacted: "Contacted",
  docs_collected: "Docs collected",
  submitted_to_bank: "Submitted to bank",
  sanctioned: "Sanctioned",
  disbursed: "Disbursed",
  closed: "Closed",
  rejected: "Rejected",
  on_hold: "On hold",
};

// Warning reads as "someone still owes this application work", success as
// "money moved", danger as "it ended badly", neutral as "settled and inert".
const STATUS_TONE: Record<string, StatusTone> = {
  new: "warning",
  assigned: "info",
  contacted: "info",
  docs_collected: "info",
  submitted_to_bank: "info",
  sanctioned: "success",
  disbursed: "success",
  closed: "neutral",
  rejected: "danger",
  on_hold: "warning",
};

const STATUS_OPTIONS = Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }));

const LINE_LABEL: Record<string, string> = { loans: "Loans", real_estate: "Real Estate" };

function amountLabel(application: AdminLoanApplication): string {
  const sanctioned = application.amount_sanctioned;
  if (sanctioned) return formatINR(Number(sanctioned));
  const requested = application.amount_requested;
  return requested ? formatINR(Number(requested)) : "-";
}

export function AdminLoansView() {
  const { items, loading, error, setStatusFilter, reload, updateApp } = useAdminLoans();

  const [filters, setFilters] = React.useState<FilterBarValue>(EMPTY_FILTERS);
  const [sort, setSort] = React.useState<SortState>({ key: "opened_at", dir: "desc" });
  const [activeId, setActiveId] = React.useState<string | null>(null);

  // Status is the one filter the API applies server-side, so it is mirrored
  // into the shared filter object rather than duplicated as a second control.
  React.useEffect(() => {
    setStatusFilter(filters.status === "all" ? "" : filters.status);
  }, [filters.status, setStatusFilter]);

  const filtered = React.useMemo(() => {
    const rows = items.filter(
      (application) =>
        isInDateRange(application.opened_at, filters.from, filters.to) &&
        (filters.line === "all" || application.business_line === filters.line) &&
        matchesSearch(
          `${application.customer_code} ${application.loan_type_label} ${application.bank_name ?? ""}`,
          filters.search,
        ),
    );
    const direction = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sort.key) {
        case "customer_code":
          return a.customer_code.localeCompare(b.customer_code) * direction;
        case "bank_name":
          return (a.bank_name ?? "").localeCompare(b.bank_name ?? "") * direction;
        case "amount":
          return (Number(a.amount_requested ?? 0) - Number(b.amount_requested ?? 0)) * direction;
        case "status":
          return a.status.localeCompare(b.status) * direction;
        default:
          return (
            (new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime()) * direction
          );
      }
    });
  }, [filters, items, sort]);

  const { page, setPage, pageRows, total } = useFilteredPage(filtered, filters);
  const active = activeId ? items.find((item) => item.id === activeId) ?? null : null;

  const columns: DataColumn<AdminLoanApplication>[] = [
    {
      key: "customer_code",
      header: "Application",
      sortable: true,
      cellClassName: "max-w-[18rem]",
      render: (application) => (
        <DataTablePrimaryCell
          title={application.customer_code}
          subtitle={application.loan_type_label}
        />
      ),
    },
    {
      key: "bank_name",
      header: "Lender",
      sortable: true,
      render: (application) => (
        <span className="text-text-secondary">{application.bank_name ?? "Not set"}</span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      sortable: true,
      align: "right",
      render: (application) => (
        <span className="tabular-nums text-text-primary">{amountLabel(application)}</span>
      ),
    },
    {
      key: "business_line",
      header: "Line",
      render: (application) => (
        <span className="text-text-secondary">
          {LINE_LABEL[application.business_line] ?? application.business_line}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (application) => (
        <StatusBadge tone={STATUS_TONE[application.status] ?? "neutral"}>
          {STATUS_LABEL[application.status] ?? application.status}
        </StatusBadge>
      ),
    },
    {
      key: "opened_at",
      header: "Opened",
      sortable: true,
      align: "right",
      render: (application) => (
        <span className="tabular-nums text-text-secondary">{formatDate(application.opened_at)}</span>
      ),
    },
  ];

  return (
    <DashboardPage>
      <DashboardHeader
        title="Loan applications"
        description="Review and progress any loan application across the platform."
      />

      <FilterBar
        value={filters}
        onChange={setFilters}
        searchLabel="Search loan applications"
        searchPlaceholder="Customer, product, or lender"
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
          icon={Inbox}
          title={
            filtersAreActive(filters)
              ? "No applications match these filters"
              : "No loan applications yet"
          }
          description={
            filtersAreActive(filters)
              ? "Try a different search, status, line, or date range."
              : "Applications will show up here as clients apply."
          }
        />
      ) : (
        <DashboardPanel
          title="Applications"
          description={
            filtersAreActive(filters)
              ? `${total} of ${items.length} applications`
              : `${items.length} applications`
          }
          bodyClassName="p-0"
        >
          <DataTable
            columns={columns}
            rows={pageRows}
            rowKey={(application) => application.id}
            sort={sort}
            onSortChange={(key) => setSort((current) => nextSort(current, key))}
            onRowClick={(application) => setActiveId(application.id)}
            rowActionLabel="Open application"
            minWidth="min-w-[900px]"
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
                title={`${active.customer_code} · ${active.loan_type_label}`}
                description={`${active.bank_name ?? "Lender not set"} · opened ${formatDate(active.opened_at)}`}
                actions={
                  <StatusBadge tone={STATUS_TONE[active.status] ?? "neutral"}>
                    {STATUS_LABEL[active.status] ?? active.status}
                  </StatusBadge>
                }
                closeLabel="Close application"
              />
              <WorkspaceLayout
                editor={
                  <div className="mx-auto w-full max-w-3xl space-y-4">
                    <LoanProgressForm
                      application={{
                        id: active.id,
                        loan_type_id: active.loan_type_id,
                        status: active.status,
                        status_reason: active.status_reason ?? null,
                        amount_sanctioned: active.amount_sanctioned ?? null,
                        bank_id: active.bank_id ?? null,
                        interest_rate: active.interest_rate ?? null,
                        processing_fee: active.processing_fee ?? null,
                        fee_outcome: active.fee_outcome ?? null,
                        closed_at: active.closed_at ?? null,
                      }}
                      onUpdate={updateApp}
                    />
                  </div>
                }
                preview={
                  <div className="rounded-xl border border-border bg-muted/20 p-4">
                    <h3 className="text-sm font-semibold text-text-primary">Submitted answers</h3>
                    <p className="mt-0.5 text-xs leading-5 text-text-secondary">
                      The applicant&rsquo;s responses, against the form version they submitted.
                    </p>
                    <div className="mt-3">
                      <FormAnswerSummary
                        schema={active.form_schema_snapshot}
                        answers={active.form_answers}
                      />
                    </div>
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
