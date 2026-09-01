"use client";

import Image from "next/image";
import * as React from "react";
import { ClipboardList, Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import {
  PANEL_DIALOG_CLASS,
  WorkspaceDialogHeader,
  WorkspaceLayout,
} from "@/features/dashboard/workspace-dialog";
import { isInDateRange } from "@/lib/date-range";
import { formatDate } from "@/lib/format";
import { formatMobile } from "@/lib/phone";
import {
  listAdminTaskFeedbackMedia,
  type AdminTask,
  type TaskFeedbackMedia,
} from "@/lib/admin-api";

import { useAdminTasksQueue } from "./use-admin-tasks";

const TASK_TYPE_LABEL: Record<string, string> = {
  document_collection: "Document collection",
  property_visit: "Property visit",
  background_check: "Background check",
};

const LINE_LABEL: Record<string, string> = { loans: "Loans", real_estate: "Real Estate" };

const STATUS_LABEL: Record<string, string> = {
  unassigned: "Unassigned",
  assigned: "Assigned",
  in_progress: "In progress",
  blocked: "Blocked",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_TONE: Record<string, StatusTone> = {
  unassigned: "warning",
  assigned: "info",
  in_progress: "info",
  blocked: "danger",
  completed: "success",
  cancelled: "neutral",
};

const STATUS_OPTIONS = Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }));
const TYPE_OPTIONS = Object.entries(TASK_TYPE_LABEL).map(([value, label]) => ({ value, label }));
const LINE_OPTIONS = [
  { value: "loans", label: "Loans" },
  { value: "real_estate", label: "Real Estate" },
];

function dueLabel(iso: string | null): string {
  return iso ? formatDate(iso) : "No due date";
}

export function TasksQueueView() {
  const { tasks, loading, error, reload } = useAdminTasksQueue();
  const [filters, setFilters] = React.useState<FilterBarValue>(EMPTY_FILTERS);
  const [sort, setSort] = React.useState<SortState>({ key: "due_at", dir: "asc" });
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<TaskFeedbackMedia[]>([]);
  const [feedbackLoading, setFeedbackLoading] = React.useState(false);

  const active = React.useMemo(
    () => tasks.find((task) => task.id === activeId) ?? null,
    [activeId, tasks],
  );

  React.useEffect(() => {
    let activeRequest = true;
    if (!active || active.task_type !== "property_visit") {
      setFeedback([]);
      return;
    }
    setFeedbackLoading(true);
    void listAdminTaskFeedbackMedia(active.id).then((result) => {
      if (!activeRequest) return;
      setFeedback(result.ok ? result.data : []);
      setFeedbackLoading(false);
      if (!result.ok) toast.error("Couldn't load feedback", { description: result.error });
    });
    return () => {
      activeRequest = false;
    };
  }, [active]);

  const filtered = React.useMemo(() => {
    const rows = tasks.filter((task) => {
      if (filters.line !== "all" && task.business_line !== filters.line) return false;
      if (filters.status !== "all" && task.status !== filters.status) return false;
      if (filters.kind !== "all" && task.task_type !== filters.kind) return false;
      if (!isInDateRange(task.due_at ?? task.created_at, filters.from, filters.to)) return false;
      return matchesSearch(
        `${task.lead_name ?? ""} ${task.lead_mobile} ${task.raised_by_telecaller_name ?? ""} ${task.assigned_employee_name ?? ""}`,
        filters.search,
      );
    });
    const direction = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((left, right) => {
      const result =
        sort.key === "lead"
          ? (left.lead_name ?? "").localeCompare(right.lead_name ?? "")
          : sort.key === "task"
            ? (TASK_TYPE_LABEL[left.task_type] ?? left.task_type).localeCompare(
                TASK_TYPE_LABEL[right.task_type] ?? right.task_type,
              )
            : sort.key === "employee"
              ? (left.assigned_employee_name ?? "").localeCompare(
                  right.assigned_employee_name ?? "",
                )
              : sort.key === "status"
                ? left.status.localeCompare(right.status)
                : // Undated tasks sort last in both directions rather than
                  // masquerading as the oldest due date.
                  (left.due_at ?? "9999").localeCompare(right.due_at ?? "9999");
      return result * direction || left.created_at.localeCompare(right.created_at);
    });
  }, [filters, sort, tasks]);

  const { page, setPage, pageRows, total } = useFilteredPage(filtered, [filters, sort]);

  const columns: readonly DataColumn<AdminTask>[] = [
    {
      key: "lead",
      header: "Lead",
      sortable: true,
      cellClassName: "max-w-[16rem]",
      render: (task) => (
        <DataTablePrimaryCell
          title={task.lead_name ?? "Unnamed lead"}
          subtitle={formatMobile(task.lead_mobile)}
        />
      ),
    },
    {
      key: "task",
      header: "Task",
      sortable: true,
      render: (task) => (
        <DataTablePrimaryCell
          title={TASK_TYPE_LABEL[task.task_type] ?? task.task_type}
          subtitle={LINE_LABEL[task.business_line] ?? task.business_line}
        />
      ),
    },
    {
      key: "employee",
      header: "Employee",
      sortable: true,
      render: (task) =>
        task.assigned_employee_name ? (
          <span className="text-text-secondary">{task.assigned_employee_name}</span>
        ) : (
          <span className="text-text-secondary">Awaiting automatic assignment</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (task) => (
        <StatusBadge tone={STATUS_TONE[task.status] ?? "neutral"}>
          {STATUS_LABEL[task.status] ?? task.status.replaceAll("_", " ")}
        </StatusBadge>
      ),
    },
    {
      key: "due_at",
      header: "Due",
      sortable: true,
      align: "right",
      render: (task) => (
        <span className="tabular-nums text-text-secondary">{dueLabel(task.due_at)}</span>
      ),
    },
  ];

  return (
    <DashboardPage>
      <DashboardHeader
        title="Task assignments"
        description="Every field task with its raising Telecaller and assigned Employee. Open a row for the full record."
      />

      <FilterBar
        value={filters}
        onChange={setFilters}
        searchLabel="Search task assignments"
        searchPlaceholder="Lead, Telecaller, or Employee"
        statusOptions={STATUS_OPTIONS}
        kindOptions={TYPE_OPTIONS}
        kindLabel="Task types"
        lineOptions={LINE_OPTIONS}
        dateFromLabel="Due from"
        dateToLabel="Due to"
      />

      {loading ? (
        <ListLoadingState />
      ) : error ? (
        <FetchError status={null} message={error} onRetry={() => void reload()} />
      ) : total === 0 ? (
        <ListEmptyState
          icon={ClipboardList}
          title={
            filtersAreActive(filters) ? "No tasks match these filters" : "No field tasks yet"
          }
          description={
            filtersAreActive(filters)
              ? "Try a different search, line, type, status, or due-date range."
              : "Tasks Telecallers raise against a lead will show up here."
          }
        />
      ) : (
        <DashboardPanel
          title="Assignments"
          description={
            filtersAreActive(filters) ? `${total} of ${tasks.length} tasks` : `${tasks.length} tasks`
          }
          bodyClassName="p-0"
        >
          <DataTable
            columns={columns}
            rows={pageRows}
            rowKey={(task) => task.id}
            sort={sort}
            onSortChange={(key) => setSort((current) => nextSort(current, key))}
            onRowClick={(task) => setActiveId(task.id)}
            rowActionLabel="Open task"
            minWidth="min-w-[900px]"
          />
          <div className="px-5 pb-4">
            <ListPagination page={page} total={total} onPageChange={setPage} />
          </div>
        </DashboardPanel>
      )}

      <Dialog open={active !== null} onOpenChange={(open) => !open && setActiveId(null)}>
        <DialogContent showCloseButton={false} className={PANEL_DIALOG_CLASS}>
          {active ? (
            <>
              <WorkspaceDialogHeader
                title={TASK_TYPE_LABEL[active.task_type] ?? active.task_type}
                description={`${active.lead_name ?? "Unnamed lead"} · due ${dueLabel(active.due_at)}`}
                closeLabel="Close task"
                actions={
                  <StatusBadge tone={STATUS_TONE[active.status] ?? "neutral"}>
                    {STATUS_LABEL[active.status] ?? active.status.replaceAll("_", " ")}
                  </StatusBadge>
                }
              />

              <WorkspaceLayout
                editor={
                  <div className="space-y-5 pb-2">
                    <section className="rounded-xl border border-border bg-card p-5">
                      <h2 className="font-semibold text-text-primary">Assignment</h2>
                      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                            Lead
                          </dt>
                          <dd className="mt-1 text-sm leading-6 text-text-primary">
                            {active.lead_name ?? "Unnamed lead"} ·{" "}
                            {formatMobile(active.lead_mobile)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                            Line
                          </dt>
                          <dd className="mt-1 text-sm leading-6 text-text-primary">
                            {LINE_LABEL[active.business_line] ?? active.business_line}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                            Raised by
                          </dt>
                          <dd className="mt-1 text-sm leading-6 text-text-primary">
                            {active.raised_by_telecaller_name ?? "Unavailable"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                            Assigned to
                          </dt>
                          <dd className="mt-1 text-sm leading-6 text-text-primary">
                            {active.assigned_employee_name ?? "Awaiting automatic assignment"}
                          </dd>
                        </div>
                      </dl>
                      {active.notes ? (
                        <div className="mt-4 border-t border-border pt-4">
                          <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                            Notes
                          </dt>
                          <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text-primary">
                            {active.notes}
                          </dd>
                        </div>
                      ) : null}
                      {active.outcome ? (
                        <div className="mt-4 border-t border-border pt-4">
                          <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                            Outcome
                          </dt>
                          <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text-primary">
                            {active.outcome}
                          </dd>
                        </div>
                      ) : null}
                    </section>

                    {active.task_type === "property_visit" ? (
                      <section className="rounded-xl border border-border bg-card p-5">
                        <h2 className="font-semibold text-text-primary">Visit feedback</h2>
                        <p className="mt-1 text-sm leading-6 text-text-secondary">
                          Private attachments from the assigned Employee, retained for 90 days
                          after closure.
                        </p>
                        {feedbackLoading ? (
                          <div className="flex justify-center py-10">
                            <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading feedback" />
                          </div>
                        ) : feedback.length === 0 ? (
                          <p className="py-6 text-sm text-text-secondary">
                            No feedback attachments yet.
                          </p>
                        ) : (
                          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                            {feedback.map((item, index) => (
                              <li
                                key={item.id}
                                className="overflow-hidden rounded-xl border border-border"
                              >
                                {item.preview_url ? (
                                  <a
                                    href={item.preview_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="relative block aspect-video bg-muted"
                                  >
                                    <Image
                                      src={item.preview_url}
                                      alt={`Visit feedback ${index + 1}`}
                                      fill
                                      unoptimized
                                      className="object-cover"
                                    />
                                  </a>
                                ) : (
                                  <div className="flex aspect-video items-center justify-center bg-muted">
                                    <FileText className="h-7 w-7" aria-hidden="true" />
                                  </div>
                                )}
                                <div className="p-3">
                                  <Button asChild size="sm" variant="outline" className="w-full">
                                    <a href={item.download_url} target="_blank" rel="noreferrer">
                                      <Download className="h-4 w-4" aria-hidden="true" /> Download
                                    </a>
                                  </Button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                    ) : null}
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
