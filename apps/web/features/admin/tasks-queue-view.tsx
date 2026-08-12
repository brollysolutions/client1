"use client";

import Image from "next/image";
import * as React from "react";
import { ClipboardList, Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listAdminTaskFeedbackMedia,
  type AdminTask,
  type TaskFeedbackMedia,
} from "@/lib/admin-api";
import { useAdminTasksQueue } from "./use-admin-tasks";
import { AdminPagination, ADMIN_PAGE_SIZE, isInDateRange } from "./admin-list-tools";

const TASK_TYPE_LABEL: Record<string, string> = {
  document_collection: "Document collection",
  property_visit: "Property visit",
  background_check: "Background check",
};
const LINE_LABEL: Record<string, string> = { loans: "Loans", real_estate: "Real Estate" };

function formatDate(iso: string | null): string {
  if (!iso) return "No due date";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "No due date"
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function TasksQueueView() {
  const { tasks, loading, error, reload } = useAdminTasksQueue();
  const [line, setLine] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [taskType, setTaskType] = React.useState("all");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(0);
  const filtered = React.useMemo(() => tasks.filter((task) => (
    (line === "all" || task.business_line === line) &&
    (status === "all" || task.status === status) &&
    (taskType === "all" || task.task_type === taskType) &&
    isInDateRange(task.due_at ?? task.created_at, dateFrom, dateTo) &&
    `${task.lead_name ?? ""} ${task.raised_by_telecaller_name ?? ""} ${task.assigned_employee_name ?? ""}`.toLowerCase().includes(search.toLowerCase())
  )), [dateFrom, dateTo, line, search, status, taskType, tasks]);
  React.useEffect(() => setPage(0), [dateFrom, dateTo, line, search, status, taskType]);
  const pageTasks = filtered.slice(page * ADMIN_PAGE_SIZE, (page + 1) * ADMIN_PAGE_SIZE);
  const [feedbackTask, setFeedbackTask] = React.useState<AdminTask | null>(null);
  const [feedback, setFeedback] = React.useState<TaskFeedbackMedia[]>([]);
  const [feedbackLoading, setFeedbackLoading] = React.useState(false);

  React.useEffect(() => {
    let activeRequest = true;
    if (!feedbackTask) {
      setFeedback([]);
      return;
    }
    setFeedbackLoading(true);
    void listAdminTaskFeedbackMedia(feedbackTask.id).then((result) => {
      if (!activeRequest) return;
      setFeedback(result.ok ? result.data : []);
      setFeedbackLoading(false);
      if (!result.ok) toast.error("Couldn’t load feedback", { description: result.error });
    });
    return () => {
      activeRequest = false;
    };
  }, [feedbackTask]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Field assignments</h1>
        <p className="text-sm text-text-secondary">
          Read-only view of each lead, raising Telecaller, and assigned Employee.
        </p>
      </div>

      <div className="grid gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-3">
        <Input aria-label="Search field assignments" placeholder="Lead, Telecaller, or Employee" value={search} onChange={(event) => setSearch(event.target.value)} />
        <Select value={line} onValueChange={setLine}><SelectTrigger aria-label="Filter field assignments by line"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All lines</SelectItem><SelectItem value="loans">Loans</SelectItem><SelectItem value="real_estate">Real Estate</SelectItem></SelectContent></Select>
        <Select value={taskType} onValueChange={setTaskType}><SelectTrigger aria-label="Filter field assignments by type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All task types</SelectItem>{Object.entries(TASK_TYPE_LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
        <Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="Filter field assignments by status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="unassigned">Unassigned</SelectItem><SelectItem value="assigned">Assigned</SelectItem><SelectItem value="in_progress">In progress</SelectItem><SelectItem value="blocked">Blocked</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select>
        <Input aria-label="Field assignments from date" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        <Input aria-label="Field assignments to date" type="date" min={dateFrom || undefined} value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-border bg-card py-16">
          <Loader2 className="h-6 w-6 animate-spin text-brand-navy" aria-label="Loading field tasks" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-text-secondary">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => void reload()}>
            Try again
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-12 text-center">
          <ClipboardList className="h-8 w-8 text-text-secondary" aria-hidden="true" />
          <p className="mt-3 font-medium text-text-primary">No field tasks</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {pageTasks.map((task) => (
            <li
              key={task.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{TASK_TYPE_LABEL[task.task_type] ?? task.task_type}</Badge>
                  <Badge variant="secondary">{LINE_LABEL[task.business_line] ?? task.business_line}</Badge>
                  <Badge variant="secondary">{task.status.replaceAll("_", " ")}</Badge>
                </div>
                <p className="text-sm text-text-primary">
                  Lead: {task.lead_name ?? "Unnamed lead"} · {task.lead_mobile}
                </p>
                <p className="text-xs text-text-secondary">
                  Telecaller: {task.raised_by_telecaller_name ?? "Unavailable"} · Employee:{" "}
                  {task.assigned_employee_name ?? "Awaiting automatic assignment"}
                </p>
                <p className="text-xs text-text-secondary">Due: {formatDate(task.due_at)}</p>
                {task.notes ? <p className="truncate text-sm text-text-primary">{task.notes}</p> : null}
              </div>
              {task.task_type === "property_visit" ? (
                <Button variant="outline" onClick={() => setFeedbackTask(task)}>
                  View feedback
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {!loading && !error && filtered.length > 0 ? <AdminPagination page={page} total={filtered.length} onPageChange={setPage} /> : null}

      <Dialog open={feedbackTask !== null} onOpenChange={(open) => !open && setFeedbackTask(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Property visit feedback</DialogTitle>
            <DialogDescription>
              Private attachments from the assigned Employee, retained for 90 days after closure.
            </DialogDescription>
          </DialogHeader>
          {feedbackLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : feedback.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-secondary">No feedback attachments yet.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {feedback.map((item, index) => (
                <li key={item.id} className="overflow-hidden rounded-xl border border-border">
                  {item.preview_url ? (
                    <a href={item.preview_url} target="_blank" rel="noreferrer" className="relative block aspect-video bg-muted">
                      <Image src={item.preview_url} alt={`Visit feedback ${index + 1}`} fill unoptimized className="object-cover" />
                    </a>
                  ) : (
                    <div className="flex aspect-video items-center justify-center bg-muted">
                      <FileText className="h-7 w-7" />
                    </div>
                  )}
                  <div className="p-3">
                    <Button asChild size="sm" variant="outline" className="w-full">
                      <a href={item.download_url} target="_blank" rel="noreferrer">
                        <Download className="h-4 w-4" /> Download
                      </a>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
