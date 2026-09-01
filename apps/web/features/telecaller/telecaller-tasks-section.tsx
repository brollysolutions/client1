"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError, RequiredIndicator } from "@/components/ui/field-error";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DashboardPanel } from "@/features/dashboard/dashboard-ui";
import type { ApiResponse } from "@/lib/api/client";
import { apiIssuesToFieldErrors, focusFirstInvalidField } from "@/lib/form-validation";
import type { Task, TaskCreate } from "@/lib/telecaller-api";

import { validateFieldTask } from "./telecaller-lead-detail-validation";

const STATUS_LABEL: Record<string, string> = {
  unassigned: "Unassigned",
  assigned: "Assigned",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  blocked: "Blocked",
};

function statusVariant(status: string): "secondary" | "default" | "outline" {
  if (status === "completed") return "default";
  if (status === "cancelled" || status === "blocked") return "outline";
  return "secondary";
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function TelecallerTasksSection({
  tasks,
  onRaiseTask,
}: {
  tasks: Task[];
  onRaiseTask: (payload: TaskCreate) => Promise<ApiResponse<unknown>>;
}) {
  const [notes, setNotes] = React.useState("");
  const [notesError, setNotesError] = React.useState<string>();
  const [dueAt, setDueAt] = React.useState("");
  const [dueAtError, setDueAtError] = React.useState<string>();
  const [saving, setSaving] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validation = validateFieldTask({ notes, dueAt });
    setNotesError(validation.notes);
    setDueAtError(validation.dueAt);
    if (validation.notes || validation.dueAt) {
      requestAnimationFrame(() => {
        if (formRef.current) focusFirstInvalidField(formRef.current);
      });
      return;
    }
    const parsedDueAt = dueAt ? new Date(dueAt) : null;
    setSaving(true);
    const res = await onRaiseTask({
      notes: notes.trim(),
      due_at: parsedDueAt?.toISOString() ?? null,
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Field task raised");
      setNotes("");
      setNotesError(undefined);
      setDueAt("");
      setDueAtError(undefined);
    } else {
      const serverErrors = apiIssuesToFieldErrors(res.issues, {
        notes: "notes",
        due_at: "dueAt",
      });
      setNotesError(serverErrors.notes);
      setDueAtError(serverErrors.dueAt);
      if (Object.keys(serverErrors).length > 0) {
        requestAnimationFrame(() => {
          if (formRef.current) focusFirstInvalidField(formRef.current);
        });
      }
      toast.error("Couldn't raise task", { description: (res as { error?: string }).error });
    }
  }

  return (
    <DashboardPanel
      title="Field tasks"
      description="Raise a document-collection visit for automatic Employee assignment."
    >
      <form ref={formRef} className="space-y-4" noValidate onSubmit={(e) => void onSubmit(e)}>
        <div>
          <Label htmlFor="task-notes">What&apos;s needed<RequiredIndicator /></Label>
          <Textarea
            id="task-notes"
            name="task_notes"
            rows={2}
            maxLength={1000}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setNotesError(undefined);
            }}
            placeholder="e.g. Collect salary slips and bank statements"
            aria-required="true"
            aria-invalid={Boolean(notesError)}
            aria-describedby={notesError ? "task-notes-error" : undefined}
          />
          <FieldError id="task-notes-error">{notesError}</FieldError>
        </div>
        <div className="sm:w-1/2">
          <Label htmlFor="task-due">Due by (optional)</Label>
          <input
            id="task-due"
            name="task_due_at"
            type="datetime-local"
            value={dueAt}
            onChange={(e) => {
              setDueAt(e.target.value);
              setDueAtError(undefined);
            }}
            aria-invalid={Boolean(dueAtError)}
            aria-describedby={dueAtError ? "task-due-error" : undefined}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <FieldError id="task-due-error">{dueAtError}</FieldError>
        </div>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Raise field task
        </Button>
      </form>

      <div className="mt-5">
        {tasks.length === 0 ? (
          <p className="text-sm text-text-secondary">No field tasks raised yet.</p>
        ) : (
          <ul className="space-y-2">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3"
              >
                <div>
                  <p className="text-sm text-text-primary">{task.notes || "Document collection"}</p>
                  {task.due_at ? (
                    <p className="mt-1 text-xs text-text-secondary">
                      Due: {formatDateTime(task.due_at)}
                    </p>
                  ) : null}
                </div>
                <Badge variant={statusVariant(task.status)}>
                  {STATUS_LABEL[task.status] ?? task.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardPanel>
  );
}
