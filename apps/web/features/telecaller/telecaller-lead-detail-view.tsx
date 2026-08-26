"use client";

import * as React from "react";
import { Loader2, MessageCircle, Phone } from "lucide-react";
import { toast } from "sonner";

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
import {
  DashboardBackLink,
  DashboardFormSection,
  DashboardPage,
  DashboardPanel,
} from "@/features/dashboard/dashboard-ui";
import { FetchError } from "@/features/dashboard/fetch-error";
import { formatMobile, toE164, toWaHref } from "@/lib/phone";
import type { LeadActivityCreate } from "@/lib/telecaller-api";
import { cn } from "@/lib/utils";

import {
  DISPOSITION_LABEL,
  DISPOSITION_OPTIONS,
  INTEREST_OPTIONS,
  LEAD_STATUS_OPTIONS,
  STATUS_LABEL,
  dispositionDotClass,
  formatDateTime,
} from "./telecaller-lead-status";
import { TelecallerLoanAppsSection } from "./telecaller-loan-apps-section";
import { TelecallerPropertyDealsSection } from "./telecaller-property-deals-section";
import { TelecallerTasksSection } from "./telecaller-tasks-section";
import { useTelecallerLeadDetail } from "./use-telecaller-lead-detail";

export function TelecallerLeadDetailView({ leadId }: { leadId: string }) {
  const {
    lead,
    status,
    error,
    errorStatus,
    retry,
    updateStatus,
    logCall,
    addTxn,
    raiseTask,
    updateApp,
    createDeal,
    updateDeal,
  } = useTelecallerLeadDetail(leadId);

  const [disposition, setDisposition] = React.useState<LeadActivityCreate["disposition"] | "">("");
  const [interestLevel, setInterestLevel] = React.useState<
    NonNullable<LeadActivityCreate["interest_level"]> | ""
  >("");
  const [notes, setNotes] = React.useState("");
  const [followUpAt, setFollowUpAt] = React.useState("");
  const [loggingCall, setLoggingCall] = React.useState(false);
  const [updatingStatus, setUpdatingStatus] = React.useState(false);
  const [dispositionError, setDispositionError] = React.useState<string | null>(null);
  const [interestError, setInterestError] = React.useState<string | null>(null);

  async function onLogCall(e: React.FormEvent) {
    e.preventDefault();
    if (!disposition) {
      setDispositionError("Choose a call outcome.");
      toast.error("Choose a call outcome");
      return;
    }
    setDispositionError(null);
    if (disposition === "connected" && !interestLevel) {
      setInterestError("Choose an interest level.");
      toast.error("Choose an interest level", {
        description: "Required when the call connected.",
      });
      return;
    }
    setInterestError(null);
    setLoggingCall(true);
    const res = await logCall({
      disposition,
      interest_level: disposition === "connected" ? interestLevel || null : null,
      notes: notes.trim() || null,
      follow_up_at: followUpAt ? new Date(followUpAt).toISOString() : null,
    });
    setLoggingCall(false);
    if (res.ok) {
      toast.success("Call logged");
      setDisposition("");
      setInterestLevel("");
      setNotes("");
      setFollowUpAt("");
    } else {
      toast.error("Couldn't log this call", { description: (res as { error?: string }).error });
    }
  }

  async function onStatusChange(next: "working" | "converted" | "closed") {
    setUpdatingStatus(true);
    const res = await updateStatus({ status: next });
    setUpdatingStatus(false);
    if (res.ok) {
      toast.success("Status updated");
    } else {
      toast.error("Couldn't update status", { description: (res as { error?: string }).error });
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
    <DashboardPage className="max-w-3xl">
      <DashboardBackLink href="/dashboard/leads">Back to leads</DashboardBackLink>

      {/* DashboardPanel titles below render as <h2> — give the page an <h1>
          so screen-reader heading navigation has a top-level landmark. */}
      <h1 className="sr-only">{lead.name ?? "Unnamed lead"}</h1>

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
        {/* Icon-only, not labeled buttons — a "Call" action is a phone
            affordance (tel: only actually does anything on a device that can
            dial), so on the web dashboard it stays available but doesn't
            masquerade as a primary web action. */}
        <div className="flex gap-2">
          <Button asChild variant="outline" size="icon" aria-label="Call" title="Call">
            <a href={`tel:${toE164(lead.mobile)}`}>
              <Phone className="h-4 w-4" aria-hidden="true" />
            </a>
          </Button>
          <Button asChild variant="outline" size="icon" aria-label="WhatsApp" title="WhatsApp">
            <a href={toWaHref(lead.mobile)} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
            </a>
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {LEAD_STATUS_OPTIONS.map((o) => (
            <Button
              key={o.value}
              type="button"
              size="sm"
              variant={lead.status === o.value ? "default" : "outline"}
              disabled={updatingStatus || lead.status === o.value}
              onClick={() => void onStatusChange(o.value)}
            >
              {o.label}
            </Button>
          ))}
        </div>
      </DashboardPanel>

      <DashboardPanel title="Log a call" description="Record the outcome and schedule a follow-up.">
        <form className="space-y-6" onSubmit={(e) => void onLogCall(e)}>
          <DashboardFormSection title="Call outcome">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="disposition">
                  Outcome
                  <span aria-hidden="true"> *</span>
                  <span className="sr-only"> (required)</span>
                </Label>
                <Select
                  value={disposition}
                  onValueChange={(v) => {
                    setDisposition(v as typeof disposition);
                    if (dispositionError) setDispositionError(null);
                  }}
                >
                  <SelectTrigger
                    id="disposition"
                    className="w-full"
                    aria-invalid={!!dispositionError}
                    aria-describedby={dispositionError ? "disposition-error" : undefined}
                  >
                    <SelectValue placeholder="Choose an outcome" />
                  </SelectTrigger>
                  <SelectContent>
                    {DISPOSITION_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {dispositionError ? (
                  <p id="disposition-error" role="alert" className="mt-1.5 text-sm text-destructive">
                    {dispositionError}
                  </p>
                ) : null}
              </div>
              {disposition === "connected" ? (
                <div>
                  <Label htmlFor="interest_level">
                    Interest level
                    <span aria-hidden="true"> *</span>
                    <span className="sr-only"> (required)</span>
                  </Label>
                  <Select
                    value={interestLevel}
                    onValueChange={(v) => {
                      setInterestLevel(v as typeof interestLevel);
                      if (interestError) setInterestError(null);
                    }}
                  >
                    <SelectTrigger
                      id="interest_level"
                      className="w-full"
                      aria-invalid={!!interestError}
                      aria-describedby={interestError ? "interest-error" : undefined}
                    >
                      <SelectValue placeholder="Choose a level" />
                    </SelectTrigger>
                    <SelectContent>
                      {INTEREST_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {interestError ? (
                    <p id="interest-error" role="alert" className="mt-1.5 text-sm text-destructive">
                      {interestError}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </DashboardFormSection>

          <DashboardFormSection title="Follow-up & notes">
            <div className="sm:w-1/2">
              <Label htmlFor="follow_up_at">Follow up at (optional)</Label>
              <input
                id="follow_up_at"
                type="datetime-local"
                value={followUpAt}
                onChange={(e) => setFollowUpAt(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                rows={3}
                maxLength={1000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What did the lead say?"
              />
            </div>
          </DashboardFormSection>

          <Button type="submit" disabled={loggingCall}>
            {loggingCall ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Log call
          </Button>
        </form>
      </DashboardPanel>

      <DashboardPanel
        title="Call history"
        description={lead.activities.length === 0 ? undefined : `${lead.activities.length} calls logged`}
      >
        {lead.activities.length === 0 ? (
          <p className="text-sm text-text-secondary">No calls logged yet.</p>
        ) : (
          <ol className="relative space-y-5 border-l border-border pl-6">
            {lead.activities.map((a) => (
              <li key={a.id} className="relative">
                <span
                  className={cn(
                    "absolute -left-[29px] top-1 h-3 w-3 rounded-full ring-4 ring-card",
                    dispositionDotClass(a.disposition),
                  )}
                  aria-hidden="true"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-text-primary">
                    {DISPOSITION_LABEL[a.disposition] ?? a.disposition}
                    {a.interest_level ? ` · ${a.interest_level}` : ""}
                  </span>
                  <span className="text-xs text-text-secondary">{formatDateTime(a.created_at)}</span>
                </div>
                {a.notes ? <p className="mt-1 text-sm text-text-secondary">{a.notes}</p> : null}
                {a.follow_up_at ? (
                  <p className="mt-1 text-xs text-text-secondary">
                    Follow up: {formatDateTime(a.follow_up_at)}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </DashboardPanel>

      {lead.business_line === "loans" ? (
        <TelecallerLoanAppsSection
          applications={lead.loan_applications}
          onAddTxn={addTxn}
          onUpdateApp={updateApp}
        />
      ) : null}

      {lead.business_line === "real_estate" ? (
        <TelecallerPropertyDealsSection
          leadId={lead.id}
          deals={lead.property_deals}
          onCreateDeal={createDeal}
          onUpdateDeal={updateDeal}
        />
      ) : null}

      <TelecallerTasksSection tasks={lead.tasks} onRaiseTask={raiseTask} />
    </DashboardPage>
  );
}
