"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { FetchError } from "@/features/dashboard/fetch-error";
import type { ApiResponse } from "@/lib/api/client";
import type { EmployeeTaskUpdate } from "@/lib/employee-api";

import { EmployeeTaskDocumentPanel } from "./employee-task-document-panel";
import { useEmployeeTaskDetail } from "./use-employee-task-detail";

type TaskStatusValue = NonNullable<EmployeeTaskUpdate["status"]>;
type OutcomeValue = NonNullable<EmployeeTaskUpdate["outcome"]>;

const TYPE_LABEL: Record<string, string> = {
  document_collection: "Document collection",
  property_visit: "Property visit",
  background_check: "Background check",
};

const STATUS_LABEL: Record<string, string> = {
  assigned: "Assigned",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  blocked: "Blocked",
};

const OUTCOME_LABEL: Record<string, string> = {
  clear: "Clear",
  flagged: "Flagged",
  inconclusive: "Inconclusive",
};

// Mirrors services/employee.py's _ALLOWED_TRANSITIONS. UX only — the backend
// is the real wall.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  assigned: ["in_progress", "blocked", "cancelled"],
  in_progress: ["completed", "blocked", "cancelled"],
  blocked: ["in_progress", "cancelled"],
};

const TERMINAL = new Set(["completed", "cancelled"]);

function statusVariant(status: string): "secondary" | "default" | "outline" {
  if (status === "completed") return "default";
  if (status === "cancelled" || status === "blocked") return "outline";
  return "secondary";
}

export function EmployeeTaskDetailView({ taskId }: { taskId: string }) {
  const { task, status, error, errorStatus, retry, updateTask } = useEmployeeTaskDetail(taskId);
  const [notes, setNotes] = React.useState("");
  const [outcome, setOutcome] = React.useState<string>("");
  const [actingStatus, setActingStatus] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (task) {
      setNotes(task.notes ?? "");
      setOutcome(task.outcome ?? "");
    }
  }, [task]);

  if (status === "loading") {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 sm:px-6 lg:px-10">
        <Skeleton className="h-9 w-48 rounded-lg" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  if (status === "error" || !task) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 lg:px-10">
        <FetchError status={errorStatus} message={error} onRetry={retry} />
      </div>
    );
  }

  const allowed = ALLOWED_TRANSITIONS[task.status] ?? [];
  const isTerminal = TERMINAL.has(task.status);
  const isBackgroundCheck = task.task_type === "background_check";
  const isPropertyVisit = task.task_type === "property_visit";
  const isDocumentCollection = task.task_type === "document_collection";
  const wantsCompletion = allowed.includes("completed");

  async function act(
    nextStatus: TaskStatusValue | null,
    opts?: { requireOutcome?: boolean; requireNotes?: boolean },
  ) {
    if (opts?.requireOutcome && !outcome) {
      toast.error("Choose an outcome before completing this check.");
      return;
    }
    if (opts?.requireNotes && !notes.trim()) {
      toast.error("Add a note explaining the no-show before continuing.");
      return;
    }
    setActingStatus(nextStatus ?? "notes");
    // Always send notes (even "") so clearing the field back to blank actually
    // reaches the backend — `|| undefined` would silently drop that intent.
    const res: ApiResponse<unknown> = await updateTask({
      status: nextStatus ?? undefined,
      notes: notes.trim(),
      outcome: opts?.requireOutcome ? (outcome as OutcomeValue) : undefined,
    });
    setActingStatus(null);
    if (res.ok) {
      toast.success("Task updated");
    } else {
      toast.error("Couldn't update task", { description: (res as { error?: string }).error });
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">
          {task.lead_name ?? task.lead_mobile}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">{task.lead_mobile}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-5">
        <Badge variant="secondary">{TYPE_LABEL[task.task_type] ?? task.task_type}</Badge>
        <Badge variant={statusVariant(task.status)}>
          {STATUS_LABEL[task.status] ?? task.status}
        </Badge>
        {task.outcome ? (
          <Badge variant="outline">{OUTCOME_LABEL[task.outcome] ?? task.outcome}</Badge>
        ) : null}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-text-primary">Notes</h2>
        <Textarea
          className="mt-3"
          rows={4}
          maxLength={1000}
          value={notes}
          disabled={isTerminal}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add details about this task"
        />

        {!isTerminal && (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            {isBackgroundCheck && wantsCompletion ? (
              <div className="w-48">
                <Label htmlFor="outcome">Outcome</Label>
                <Select value={outcome} onValueChange={setOutcome}>
                  <SelectTrigger id="outcome">
                    <SelectValue placeholder="Choose outcome" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(OUTCOME_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {task.status === "assigned" && allowed.includes("in_progress") ? (
                <ActionButton
                  label="Start"
                  loading={actingStatus === "in_progress"}
                  onClick={() => void act("in_progress")}
                />
              ) : null}

              {allowed.includes("in_progress") && task.status === "blocked" ? (
                <ActionButton
                  label="Resume"
                  loading={actingStatus === "in_progress"}
                  onClick={() => void act("in_progress")}
                />
              ) : null}

              {wantsCompletion ? (
                <ActionButton
                  label={isPropertyVisit ? "Mark visited" : "Complete"}
                  loading={actingStatus === "completed"}
                  onClick={() => void act("completed", { requireOutcome: isBackgroundCheck })}
                />
              ) : null}

              {isPropertyVisit && task.status === "in_progress" ? (
                <ActionButton
                  label="Mark no-show"
                  variant="outline"
                  loading={actingStatus === "cancelled"}
                  onClick={() => void act("cancelled", { requireNotes: true })}
                />
              ) : allowed.includes("cancelled") ? (
                <ActionButton
                  label="Cancel"
                  variant="outline"
                  loading={actingStatus === "cancelled"}
                  onClick={() => void act("cancelled")}
                />
              ) : null}

              {allowed.includes("blocked") ? (
                <ActionButton
                  label="Block"
                  variant="outline"
                  loading={actingStatus === "blocked"}
                  onClick={() => void act("blocked")}
                />
              ) : null}

              <ActionButton
                label="Save notes"
                variant="outline"
                loading={actingStatus === "notes"}
                onClick={() => void act(null)}
              />
            </div>
          </div>
        )}
      </div>

      {isDocumentCollection ? (
        <EmployeeTaskDocumentPanel taskId={task.id} disabled={isTerminal} />
      ) : null}
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  loading,
  variant,
}: {
  label: string;
  onClick: () => void;
  loading: boolean;
  variant?: "default" | "outline";
}) {
  return (
    <Button type="button" size="sm" variant={variant} disabled={loading} onClick={onClick}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {label}
    </Button>
  );
}
