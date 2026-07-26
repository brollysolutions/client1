"use client";

import * as React from "react";
import { CheckCircle2, ClipboardList, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { assignTask, type AdminTask } from "@/lib/admin-api";
import { useAdminTasksQueue } from "./use-admin-tasks";

const TASK_TYPE_LABEL: Record<string, string> = {
  document_collection: "Document collection",
  property_visit: "Property visit",
  background_check: "Background check",
};

const LINE_LABEL: Record<string, string> = {
  loans: "Loans",
  real_estate: "Real Estate",
};

function formatDate(iso: string | null): string {
  if (!iso) return "No due date";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "No due date"
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function shortId(id: string): string {
  return `${id.slice(0, 8)}…`;
}

export function TasksQueueView() {
  const { tasks, employees, loading, error, reload } = useAdminTasksQueue();
  const [active, setActive] = React.useState<AdminTask | null>(null);
  const [selectedEmployee, setSelectedEmployee] = React.useState<string>("");
  const [busy, setBusy] = React.useState(false);

  const eligibleEmployees = React.useMemo(
    () => employees.filter((e) => e.business_line === active?.business_line),
    [employees, active],
  );

  function openAssign(task: AdminTask) {
    setActive(task);
    setSelectedEmployee("");
  }

  async function onAssign() {
    if (!active || !selectedEmployee) return;
    setBusy(true);
    const res = await assignTask(active.id, selectedEmployee);
    setBusy(false);
    if (res.ok) {
      toast.success("Task assigned");
      setActive(null);
      void reload();
    } else {
      toast.error("Could not assign task", { description: res.error });
    }
  }

  async function copyLeadId(id: string) {
    await navigator.clipboard.writeText(id);
    toast.success("Lead ID copied");
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Unassigned tasks</h1>
        <p className="text-sm text-text-secondary">
          Hand each field task to an active employee on the matching business line.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-border bg-card py-16">
          <Loader2 className="h-6 w-6 animate-spin text-brand-navy" aria-hidden="true" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-text-secondary">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => void reload()}>
            Try again
          </Button>
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-12 text-center">
          <ClipboardList className="h-8 w-8 text-text-secondary" aria-hidden="true" />
          <p className="mt-3 font-medium text-text-primary">No unassigned tasks</p>
          <p className="mt-1 text-sm text-text-secondary">
            New field tasks raised by telecallers will show up here.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {TASK_TYPE_LABEL[task.task_type] ?? task.task_type}
                  </Badge>
                  <Badge variant="secondary">
                    {LINE_LABEL[task.business_line] ?? task.business_line}
                  </Badge>
                </div>
                <p className="text-xs text-text-secondary">Due: {formatDate(task.due_at)}</p>
                {task.notes ? (
                  <p className="truncate text-sm text-text-primary">{task.notes}</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => void copyLeadId(task.lead_uuid)}
                  className="flex items-center gap-1 text-xs text-text-secondary hover:text-brand-cta"
                >
                  <Copy className="h-3 w-3" aria-hidden="true" />
                  Lead {shortId(task.lead_uuid)}
                </button>
              </div>
              <Button onClick={() => openAssign(task)}>Assign</Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={active !== null} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-lg">
          {active ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {TASK_TYPE_LABEL[active.task_type] ?? active.task_type}
                </DialogTitle>
                <DialogDescription>
                  {LINE_LABEL[active.business_line] ?? active.business_line} · Lead{" "}
                  {shortId(active.lead_uuid)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleEmployees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.first_name} {e.last_name} ({e.staff_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {eligibleEmployees.length === 0 ? (
                  <p className="text-xs text-text-secondary">
                    No active employees on this business line.
                  </p>
                ) : null}
              </div>

              <DialogFooter>
                <Button
                  onClick={() => void onAssign()}
                  disabled={busy || !selectedEmployee}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Assign
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
