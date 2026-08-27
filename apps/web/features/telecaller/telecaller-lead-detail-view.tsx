"use client";

import * as React from "react";
import { Loader2, MessageCircle, Phone } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FieldError, RequiredIndicator } from "@/components/ui/field-error";
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
import { UserAvatar } from "@/components/user-avatar";
import {
  DashboardBackLink,
  DashboardFormSection,
  DashboardHeader,
  DashboardPage,
  DashboardPanel,
} from "@/features/dashboard/dashboard-ui";
import { FetchError } from "@/features/dashboard/fetch-error";
import {
  apiIssuesToFieldErrors,
  focusFirstInvalidField,
  type FieldErrors,
} from "@/lib/form-validation";
import { formatMobile, toE164, toWaHref } from "@/lib/phone";
import type { LeadActivityCreate } from "@/lib/telecaller-api";
import { cn } from "@/lib/utils";

import {
  validateCallLog,
  type CallLogField,
} from "./telecaller-lead-detail-validation";
import {
  DISPOSITION_LABEL,
  DISPOSITION_OPTIONS,
  INTEREST_OPTIONS,
  LEAD_STATUS_OPTIONS,
  STATUS_LABEL,
  dispositionDotClass,
  formatDateTime,
  statusAccentBorderClass,
} from "./telecaller-lead-status";
import { TelecallerLoanAppsSection } from "./telecaller-loan-apps-section";
import { TelecallerPropertyDealsSection } from "./telecaller-property-deals-section";
import { TelecallerTasksSection } from "./telecaller-tasks-section";
import { useTelecallerLeadDetail } from "./use-telecaller-lead-detail";

type CallFormField = CallLogField | "disposition" | "interestLevel";

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
  const [callErrors, setCallErrors] = React.useState<FieldErrors<CallFormField>>({});
  const callFormRef = React.useRef<HTMLFormElement>(null);

  function showCallErrors(nextErrors: FieldErrors<CallFormField>) {
    setCallErrors(nextErrors);
    requestAnimationFrame(() => {
      if (callFormRef.current) focusFirstInvalidField(callFormRef.current);
    });
  }

  async function onLogCall(e: React.FormEvent) {
    e.preventDefault();
    const nextErrors: FieldErrors<CallFormField> = {
      ...validateCallLog({ followUpAt, notes }),
      disposition: disposition ? undefined : "Choose a call outcome.",
      interestLevel:
        disposition === "connected" && !interestLevel ? "Choose an interest level." : undefined,
    };
    const filteredErrors = Object.fromEntries(
      Object.entries(nextErrors).filter((entry): entry is [CallFormField, string] =>
        Boolean(entry[1]),
      ),
    );
    if (Object.keys(filteredErrors).length > 0) {
      showCallErrors(filteredErrors);
      return;
    }

    setCallErrors({});
    setLoggingCall(true);
    const res = await logCall({
      disposition: disposition as LeadActivityCreate["disposition"],
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
      setCallErrors({});
    } else {
      const serverErrors = apiIssuesToFieldErrors(res.issues, {
        disposition: "disposition",
        interest_level: "interestLevel",
        notes: "notes",
        follow_up_at: "followUpAt",
      });
      if (Object.keys(serverErrors).length > 0) showCallErrors(serverErrors);
      toast.error("Couldn't log this call", { description: res.error });
    }
  }

  async function onStatusChange(next: "working" | "converted" | "closed") {
    setUpdatingStatus(true);
    const res = await updateStatus({ status: next });
    setUpdatingStatus(false);
    if (res.ok) {
      toast.success("Status updated");
    } else {
      toast.error("Couldn't update status", { description: res.error });
    }
  }

  if (status === "loading") {
    return (
      <DashboardPage className="space-y-5">
        <Skeleton className="h-9 w-64 rounded-lg" />
        <Skeleton className="h-48 rounded-2xl" />
      </DashboardPage>
    );
  }

  if (status === "error" || !lead) {
    return (
      <DashboardPage>
        <FetchError status={errorStatus} message={error} onRetry={retry} />
      </DashboardPage>
    );
  }

  const leadName = lead.name ?? "Unnamed lead";

  return (
    <DashboardPage>
      <DashboardBackLink href="/dashboard/leads">Back to leads</DashboardBackLink>

      <DashboardHeader
        eyebrow={lead.business_line === "loans" ? "Loan lead" : "Real estate lead"}
        title={leadName}
        description={`${formatMobile(lead.mobile)} · Review progress, record the next action, and keep follow-ups current.`}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <a href={`tel:${toE164(lead.mobile)}`} aria-label={`Phone ${leadName}`}>
                <Phone className="h-4 w-4" aria-hidden="true" />
                Phone
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a
                href={toWaHref(lead.mobile)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`WhatsApp ${leadName}`}
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                WhatsApp
              </a>
            </Button>
          </>
        }
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 xl:col-start-1 xl:row-start-1">
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

        </div>

        <aside className="space-y-5 xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:sticky xl:top-24">
          <DashboardPanel
            title="Lead status"
            description="Keep the overall lead state aligned with the latest conversation."
            className={cn("border-l-4", statusAccentBorderClass(lead.status))}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <UserAvatar name={lead.name} size="lg" />
                <div className="min-w-0">
                  <p className="truncate font-medium text-text-primary">{leadName}</p>
                  <p className="text-sm text-text-secondary">{formatMobile(lead.mobile)}</p>
                </div>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                  lead.status === "converted"
                    ? "bg-success/10 text-success"
                    : "bg-muted text-text-secondary",
                )}
              >
                {STATUS_LABEL[lead.status] ?? lead.status}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {LEAD_STATUS_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={lead.status === option.value ? "default" : "outline"}
                  disabled={updatingStatus || lead.status === option.value}
                  onClick={() => void onStatusChange(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </DashboardPanel>

          <DashboardPanel
            title="Log a call"
            description="Record the outcome and schedule the next follow-up."
          >
            <form
              ref={callFormRef}
              className="space-y-5"
              noValidate
              onSubmit={(e) => void onLogCall(e)}
            >
              <DashboardFormSection title="Outcome">
                <div>
                  <Label htmlFor="lead-call-disposition">
                    Call outcome
                    <RequiredIndicator />
                  </Label>
                  <Select
                    value={disposition}
                    onValueChange={(value) => {
                      setDisposition(value as typeof disposition);
                      setCallErrors((current) => ({
                        ...current,
                        disposition: undefined,
                        interestLevel: undefined,
                      }));
                    }}
                  >
                    <SelectTrigger
                      id="lead-call-disposition"
                      className="w-full"
                      aria-required="true"
                      aria-invalid={Boolean(callErrors.disposition)}
                      aria-describedby={
                        callErrors.disposition ? "lead-call-disposition-error" : undefined
                      }
                    >
                      <SelectValue placeholder="Choose an outcome" />
                    </SelectTrigger>
                    <SelectContent>
                      {DISPOSITION_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError id="lead-call-disposition-error">
                    {callErrors.disposition}
                  </FieldError>
                </div>

                {disposition === "connected" ? (
                  <div>
                    <Label htmlFor="lead-call-interest">
                      Interest level
                      <RequiredIndicator />
                    </Label>
                    <Select
                      value={interestLevel}
                      onValueChange={(value) => {
                        setInterestLevel(value as typeof interestLevel);
                        setCallErrors((current) => ({ ...current, interestLevel: undefined }));
                      }}
                    >
                      <SelectTrigger
                        id="lead-call-interest"
                        className="w-full"
                        aria-required="true"
                        aria-invalid={Boolean(callErrors.interestLevel)}
                        aria-describedby={
                          callErrors.interestLevel ? "lead-call-interest-error" : undefined
                        }
                      >
                        <SelectValue placeholder="Choose a level" />
                      </SelectTrigger>
                      <SelectContent>
                        {INTEREST_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError id="lead-call-interest-error">
                      {callErrors.interestLevel}
                    </FieldError>
                  </div>
                ) : null}
              </DashboardFormSection>

              <DashboardFormSection title="Follow-up">
                <div>
                  <Label htmlFor="lead-call-follow-up">Follow up at (optional)</Label>
                  <input
                    id="lead-call-follow-up"
                    name="follow_up_at"
                    type="datetime-local"
                    value={followUpAt}
                    onChange={(e) => {
                      setFollowUpAt(e.target.value);
                      setCallErrors((current) => ({ ...current, followUpAt: undefined }));
                    }}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    aria-invalid={Boolean(callErrors.followUpAt)}
                    aria-describedby={
                      callErrors.followUpAt ? "lead-call-follow-up-error" : undefined
                    }
                  />
                  <FieldError id="lead-call-follow-up-error">
                    {callErrors.followUpAt}
                  </FieldError>
                </div>
                <div>
                  <Label htmlFor="lead-call-notes">Notes (optional)</Label>
                  <Textarea
                    id="lead-call-notes"
                    name="notes"
                    rows={3}
                    maxLength={1000}
                    value={notes}
                    onChange={(e) => {
                      setNotes(e.target.value);
                      setCallErrors((current) => ({ ...current, notes: undefined }));
                    }}
                    placeholder="What did the lead say?"
                    aria-invalid={Boolean(callErrors.notes)}
                    aria-describedby={callErrors.notes ? "lead-call-notes-error" : undefined}
                  />
                  <FieldError id="lead-call-notes-error">{callErrors.notes}</FieldError>
                </div>
              </DashboardFormSection>

              <Button type="submit" className="w-full" disabled={loggingCall}>
                {loggingCall ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Log call
              </Button>
            </form>
          </DashboardPanel>
        </aside>

        <div className="min-w-0 xl:col-start-1 xl:row-start-2">
          <DashboardPanel
            title="Call history"
            description={
              lead.activities.length === 0
                ? "Past call outcomes will appear here."
                : `${lead.activities.length} calls logged`
            }
          >
            {lead.activities.length === 0 ? (
              <p className="text-sm text-text-secondary">No calls logged yet.</p>
            ) : (
              <ol className="relative space-y-5 border-l border-border pl-6">
                {lead.activities.map((activity) => (
                  <li key={activity.id} className="relative">
                    <span
                      className={cn(
                        "absolute -left-[29px] top-1 h-3 w-3 rounded-full ring-4 ring-card",
                        dispositionDotClass(activity.disposition),
                      )}
                      aria-hidden="true"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-text-primary">
                        {DISPOSITION_LABEL[activity.disposition] ?? activity.disposition}
                        {activity.interest_level ? ` · ${activity.interest_level}` : ""}
                      </span>
                      <span className="text-xs text-text-secondary">
                        {formatDateTime(activity.created_at)}
                      </span>
                    </div>
                    {activity.notes ? (
                      <p className="mt-1 text-sm text-text-secondary">{activity.notes}</p>
                    ) : null}
                    {activity.follow_up_at ? (
                      <p className="mt-1 text-xs text-text-secondary">
                        Follow up: {formatDateTime(activity.follow_up_at)}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </DashboardPanel>
        </div>
      </div>

      <TelecallerTasksSection tasks={lead.tasks} onRaiseTask={raiseTask} />
    </DashboardPage>
  );
}
