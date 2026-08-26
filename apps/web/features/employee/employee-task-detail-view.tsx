"use client";

import * as React from "react";
import { Copy, Link2, Loader2, Phone, ShieldOff, Trash2 } from "lucide-react";
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
import { DashboardBackLink, DashboardPage, DashboardPanel } from "@/features/dashboard/dashboard-ui";
import { FetchError } from "@/features/dashboard/fetch-error";
import type { ApiResponse } from "@/lib/api/client";
import {
  createTaskContactShareLink,
  revokeTaskContactShareLink,
  type ContactShareLink,
  type EmployeeTaskUpdate,
} from "@/lib/employee-api";
import { formatMobile, toE164 } from "@/lib/phone";

import { EmployeeTaskDocumentPanel } from "./employee-task-document-panel";
import { EmployeeTaskFeedbackPanel } from "./employee-task-feedback-panel";
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
  const [shareLink, setShareLink] = React.useState<ContactShareLink | null>(null);
  const [sharing, setSharing] = React.useState(false);

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

  async function createShareLink() {
    setSharing(true);
    const response = await createTaskContactShareLink(taskId);
    setSharing(false);
    if (!response.ok) {
      toast.error("Couldn't create invitation", { description: response.error });
      return;
    }
    setShareLink(response.data);
    const url = `${window.location.origin}${response.data.share_path}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Dhanadhara invitation", url });
      } catch {
        // A cancelled native share leaves the revocable link visible below.
      }
    }
  }

  async function copyShareLink() {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${shareLink.share_path}`);
      toast.success("Invitation link copied");
    } catch {
      toast.error("Couldn't copy invitation", {
        description: "Copy the link from your browser's share menu instead.",
      });
    }
  }

  async function revokeShareLink() {
    if (!shareLink) return;
    setSharing(true);
    const response = await revokeTaskContactShareLink(shareLink.id);
    setSharing(false);
    if (response.ok) {
      setShareLink(null);
      toast.success("Invitation revoked");
    } else {
      toast.error("Couldn't revoke invitation", { description: response.error });
    }
  }

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
    <DashboardPage className="max-w-3xl">
      <DashboardBackLink href="/dashboard/tasks">Back to tasks</DashboardBackLink>

      {/* DashboardPanel titles below render as <h2> — give the page an <h1>
          so screen-reader heading navigation has a top-level landmark. */}
      <h1 className="sr-only">{task.lead_name ?? task.lead_mobile ?? "Assigned task"}</h1>

      <DashboardPanel
        title={task.lead_name ?? task.lead_mobile ?? "Assigned task"}
        description={task.lead_mobile ? formatMobile(task.lead_mobile) : undefined}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{TYPE_LABEL[task.task_type] ?? task.task_type}</Badge>
            <Badge variant={statusVariant(task.status)}>{STATUS_LABEL[task.status] ?? task.status}</Badge>
            {task.outcome ? (
              <Badge variant="outline">{OUTCOME_LABEL[task.outcome] ?? task.outcome}</Badge>
            ) : null}
          </div>
        }
      >
        <h2 className="sr-only">Lead contact</h2>
        {task.lead_contact_mode === "allow" && task.lead_mobile ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-text-secondary">{formatMobile(task.lead_mobile)}</span>
            <Button asChild size="icon" variant="outline" aria-label="Call" title="Call">
              <a href={`tel:${toE164(task.lead_mobile)}`}>
                <Phone className="h-4 w-4" aria-hidden="true" />
              </a>
            </Button>
          </div>
        ) : task.lead_contact_mode === "share_link" ? (
          <div className="space-y-3">
            <p className="text-sm text-text-secondary">
              The raw number is hidden. Create an expiring platform invitation to share through
              your browser or copy manually.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => void createShareLink()} disabled={sharing}>
                {sharing ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Link2 className="h-4 w-4" aria-hidden="true" />
                )}
                Create invitation
              </Button>
              {shareLink ? (
                <>
                  <Button type="button" size="sm" variant="outline" onClick={() => void copyShareLink()}>
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    Copy link
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={sharing}
                    onClick={() => void revokeShareLink()}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Revoke
                  </Button>
                </>
              ) : null}
            </div>
            {shareLink ? (
              <p className="text-xs text-text-secondary">
                Expires {new Date(shareLink.expires_at).toLocaleString("en-IN")}.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-text-secondary">
            <ShieldOff className="h-4 w-4" aria-hidden="true" />
            Contact details are hidden by Admin policy.
          </p>
        )}
      </DashboardPanel>

      <DashboardPanel title="Notes">
        <Textarea
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
      </DashboardPanel>

      {isDocumentCollection ? (
        <EmployeeTaskDocumentPanel taskId={task.id} disabled={isTerminal} />
      ) : null}
      {isPropertyVisit ? (
        <EmployeeTaskFeedbackPanel taskId={task.id} disabled={isTerminal} />
      ) : null}
    </DashboardPage>
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
