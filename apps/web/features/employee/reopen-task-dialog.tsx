"use client";
import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/ui/field-error";
import { piiFreeOperationalTextError } from "@/lib/form-validation";
import { reopenEmployeeTask } from "@/lib/employee-api";

export function ReopenTaskDialog({ taskId, onReopened }: { taskId: string; onReopened: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function reopen() {
    const message = piiFreeOperationalTextError(reason, "Reason", { required: true, minLength: 3, maxLength: 500 });
    if (message) {
      setError(message);
      return;
    }
    setBusy(true);
    const response = await reopenEmployeeTask(taskId, { reason: reason.trim() });
    setBusy(false);
    if (!response.ok) {
      setError(response.error);
      return;
    }
    setOpen(false);
    setReason("");
    toast.success("Task reopened", { description: "It is assigned to you and ready to start." });
    onReopened();
  }
  return (
    <Dialog open={open} onOpenChange={(value) => {
      if (busy) return;
      setOpen(value);
      setError(undefined);
      if (!value) setReason("");
    }}>
      <DialogTrigger asChild><Button variant="outline"><RotateCcw aria-hidden="true" />Reopen task</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader className="pr-8">
          <DialogTitle>Reopen cancelled task</DialogTitle>
          <DialogDescription>
            The task returns to Assigned. Its notes, documents and due date stay attached.
            This action is recorded in the audit log.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reopen-reason">Reason for reopening</Label>
          <Textarea id="reopen-reason" value={reason}
            onChange={(event) => { setReason(event.target.value); setError(undefined); }}
            maxLength={500} disabled={busy} aria-invalid={Boolean(error)}
            aria-describedby="reopen-reason-help reopen-reason-error" />
          <p id="reopen-reason-help" className="text-xs text-text-secondary">
            Explain the correction without personal details, passwords or document numbers.
          </p>
          <FieldError id="reopen-reason-error">{error}</FieldError>
        </div>
        <DialogFooter>
          <Button onClick={() => void reopen()} disabled={busy}>{busy ? "Reopening…" : "Reopen task"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
