"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, ClipboardList } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardHeader, DashboardPage, DashboardPanel } from "@/features/dashboard/dashboard-ui";
import { ListPagination, useListPagination } from "@/features/dashboard/list-pagination";
import { FetchError } from "@/features/dashboard/fetch-error";
import { cn } from "@/lib/utils";

import { useEmployeeTasks } from "./use-employee-tasks";

const STATUS_STYLE: Record<string, string> = {
  assigned: "bg-brand-cta-tint text-brand-cta",
  in_progress: "bg-warning/10 text-warning",
  completed: "bg-success/10 text-success",
  cancelled: "bg-muted text-text-secondary",
  blocked: "bg-muted text-text-secondary",
};

const STATUS_LABEL: Record<string, string> = {
  assigned: "Assigned",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  blocked: "Blocked",
};

const TYPE_LABEL: Record<string, string> = {
  document_collection: "Document collection",
  property_visit: "Property visit",
  background_check: "Background check",
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

// The employee's assigned-task list. Row click opens the task detail page,
// where status is transitioned and (for background checks) an outcome recorded.
export function EmployeeTasksView() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [typeFilter, setTypeFilter] = React.useState<string>("all");
  const { items, loading, error, reload } = useEmployeeTasks(
    statusFilter === "all" ? undefined : statusFilter,
    typeFilter === "all" ? undefined : typeFilter,
  );
  const { page, pageItems, setPage } = useListPagination(items);

  React.useEffect(() => {
    setPage(0);
  }, [statusFilter, typeFilter, setPage]);

  return (
    <DashboardPage>
      <DashboardHeader
        title="Tasks"
        description="Field and background-check tasks assigned to you."
      />

      <div className="grid gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger aria-label="Filter by status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger aria-label="Filter by task type">
            <SelectValue placeholder="Task type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All task types</SelectItem>
            {Object.entries(TYPE_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : error ? (
        <FetchError status={null} message={error} onRetry={() => void reload()} />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-text-secondary">
            <ClipboardList className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="mt-5 text-lg font-semibold text-text-primary">No tasks assigned yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
            Tasks assigned to you by Admin will show up here.
          </p>
        </div>
      ) : (
        <DashboardPanel title="Assigned tasks" description={`${items.length} tasks`}>
          <div className="animate-in fade-in-0 overflow-x-auto duration-200 motion-reduce:animate-none">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
                <tr>
                  <th className="px-5 py-3 font-medium">Lead</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Due</th>
                  {/* Trailing affordance column — no header label. */}
                  <th className="w-10 px-3 py-3">
                    <span className="sr-only">Open task</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((task) => (
                  <tr
                    key={task.id}
                    role="link"
                    tabIndex={0}
                    onClick={() => router.push(`/dashboard/tasks/${task.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") router.push(`/dashboard/tasks/${task.id}`);
                    }}
                    className="group cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue"
                  >
                    <td className="px-5 py-4">
                      <p className="font-medium text-text-primary transition-colors group-hover:text-brand-cta">
                        {task.lead_name ?? "Assigned lead"}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {task.lead_mobile ??
                          (task.lead_contact_mode === "share_link"
                            ? "Contact via secure invitation"
                            : "Contact details hidden")}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-text-secondary">
                      {TYPE_LABEL[task.task_type] ?? task.task_type}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                          STATUS_STYLE[task.status] ?? "bg-muted text-text-secondary",
                        )}
                      >
                        {STATUS_LABEL[task.status] ?? task.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-text-secondary">{formatDateTime(task.due_at)}</td>
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
          <ListPagination page={page} total={items.length} onPageChange={setPage} label="Assigned tasks pages" />
        </DashboardPanel>
      )}
    </DashboardPage>
  );
}
