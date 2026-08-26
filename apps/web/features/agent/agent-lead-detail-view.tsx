"use client";

import * as React from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { DashboardPanel } from "@/features/dashboard/dashboard-ui";
import { FetchError } from "@/features/dashboard/fetch-error";
import { formatMobile } from "@/lib/phone";
import { cn } from "@/lib/utils";

import { useAgentLeadDetail } from "./use-agent-lead-detail";
import { formatAgentLeadExpiry, isAgentLeadExpiryDue } from "./lead-expiry";

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  assigned: "Assigned",
  working: "Working",
  converted: "Converted",
  closed: "Closed",
  released: "Released",
  expired: "Expired",
};

export function AgentLeadDetailView({ leadId }: { leadId: string }) {
  const { lead, status, error, errorStatus, retry, update } = useAgentLeadDetail(leadId);
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const copyTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const editable = lead?.editable ?? false;

  React.useEffect(() => {
    if (lead?.requirement && typeof lead.requirement === "object") {
      const value = (lead.requirement as Record<string, unknown>).notes;
      if (typeof value === "string") setNotes(value);
    }
  }, [lead]);

  React.useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

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

  async function copyRegistrationLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/register`);
      setCopied(true);
      // Keep the toast alongside the button's own state swap below — it gives
      // screen-reader users a live-region announcement even if they miss the
      // visual icon/label change.
      toast.success("Registration link copied");
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the registration link");
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

  const readOnlyReason =
    lead.status === "expired"
      ? "This lead returned to the open pool and can no longer be edited here."
      : isAgentLeadExpiryDue(lead.status, lead.expires_at, lead.expired_at)
        ? "This lead's conversion window ended and it is awaiting pool release."
        : "A telecaller is already working this lead, so it can no longer be edited here.";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 sm:px-6 lg:px-10">
      <DashboardPanel
        title={lead.name ?? "Unnamed lead"}
        description={formatMobile(lead.mobile)}
        action={
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
              lead.status === "converted" ? "bg-success/10 text-success" : "bg-muted text-text-secondary",
            )}
          >
            {STATUS_LABEL[lead.status] ?? lead.status}
          </span>
        }
      >
        <p className="text-sm text-text-secondary">
          {lead.registered
            ? "This person has created an account."
            : "Not registered on the platform yet."}
        </p>
        {!lead.registered ? (
          <Button
            className="mt-3"
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void copyRegistrationLink()}
          >
            {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            <span aria-live="polite">{copied ? "Copied" : "Copy registration link"}</span>
          </Button>
        ) : null}
        <p className="mt-3 text-sm font-medium text-text-primary">
          {formatAgentLeadExpiry(lead.status, lead.expires_at, lead.expired_at)}
        </p>
      </DashboardPanel>

      <DashboardPanel title="Requirement">
        {editable ? (
          <form className="space-y-3" onSubmit={(e) => void onSave(e)}>
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
            <p className="text-sm text-text-secondary">{notes || "No requirement notes."}</p>
            <p className="mt-3 text-xs text-text-secondary">{readOnlyReason}</p>
          </>
        )}
      </DashboardPanel>
    </div>
  );
}
