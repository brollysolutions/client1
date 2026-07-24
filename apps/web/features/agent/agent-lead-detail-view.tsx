"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { FetchError } from "@/features/dashboard/fetch-error";
import { cn } from "@/lib/utils";

import { useAgentLeadDetail } from "./use-agent-lead-detail";

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  assigned: "Assigned",
  working: "Working",
  converted: "Converted",
  closed: "Closed",
  released: "Released",
};

export function AgentLeadDetailView({ leadId }: { leadId: string }) {
  const { lead, status, error, errorStatus, retry, update } = useAgentLeadDetail(leadId);
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  // Mirrors the DB truth: a telecaller pickup sets BOTH
  // assigned_telecaller_profile_uuid and status="assigned" in the same
  // transaction (services.leads.assign_lead_to_telecaller), so status="new"
  // is an equivalent, simpler proxy for "still unassigned, still editable."
  const editable = lead?.status === "new";

  React.useEffect(() => {
    if (lead?.requirement && typeof lead.requirement === "object") {
      const value = (lead.requirement as Record<string, unknown>).notes;
      if (typeof value === "string") setNotes(value);
    }
  }, [lead]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await update({ requirement: { notes: notes.trim() } });
    setSaving(false);
    if (res.ok) {
      toast.success("Updated");
    } else {
      toast.error("Couldn't update this lead", { description: (res as { error?: string }).error });
    }
  }

  if (status === "loading") {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 sm:px-6 lg:px-10">
        <Skeleton className="h-9 w-64 rounded-lg" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  if (status === "error" || !lead) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 lg:px-10">
        <FetchError status={errorStatus} message={error} onRetry={retry} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-text-primary">{lead.name ?? "Unnamed lead"}</h1>
            <p className="text-sm text-text-secondary">{lead.mobile}</p>
          </div>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium",
              lead.status === "converted" ? "bg-success/10 text-success" : "bg-muted text-text-secondary",
            )}
          >
            {STATUS_LABEL[lead.status] ?? lead.status}
          </span>
        </div>
        <p className="mt-3 text-sm text-text-secondary">
          {lead.registered
            ? "This person has created an account."
            : "Not registered on the platform yet."}
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold text-text-primary">Requirement</h2>
        {editable ? (
          <form className="mt-4 space-y-3" onSubmit={(e) => void onSave(e)}>
            <div>
              <Label htmlFor="notes">What are they looking for?</Label>
              <Textarea
                id="notes"
                rows={3}
                maxLength={1000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </form>
        ) : (
          <>
            <p className="mt-3 text-sm text-text-secondary">{notes || "No requirement notes."}</p>
            <p className="mt-3 text-xs text-text-secondary">
              A telecaller is already working this lead, so it can no longer be edited here.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
