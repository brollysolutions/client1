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
import { FetchError } from "@/features/dashboard/fetch-error";
import type { LeadActivityCreate } from "@/lib/telecaller-api";
import { cn } from "@/lib/utils";

import { useTelecallerLeadDetail } from "./use-telecaller-lead-detail";

const DISPOSITION_OPTIONS: { value: LeadActivityCreate["disposition"]; label: string }[] = [
  { value: "connected", label: "Connected" },
  { value: "no_answer", label: "No answer" },
  { value: "busy", label: "Busy" },
  { value: "switched_off", label: "Switched off" },
  { value: "wrong_number", label: "Wrong number" },
  { value: "callback_requested", label: "Callback requested" },
  { value: "not_interested", label: "Not interested" },
];

const INTEREST_OPTIONS: { value: NonNullable<LeadActivityCreate["interest_level"]>; label: string }[] = [
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "cold", label: "Cold" },
];

const STATUS_OPTIONS: { value: "working" | "converted" | "closed"; label: string }[] = [
  { value: "working", label: "Working" },
  { value: "converted", label: "Converted" },
  { value: "closed", label: "Closed" },
];

const DISPOSITION_LABEL = Object.fromEntries(DISPOSITION_OPTIONS.map((o) => [o.value, o.label]));

function toWaHref(mobile: string): string {
  return `https://wa.me/${mobile.replace(/[^\d]/g, "")}`;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function TelecallerLeadDetailView({ leadId }: { leadId: string }) {
  const { lead, status, error, errorStatus, retry, updateStatus, logCall } =
    useTelecallerLeadDetail(leadId);

  const [disposition, setDisposition] = React.useState<LeadActivityCreate["disposition"] | "">("");
  const [interestLevel, setInterestLevel] = React.useState<
    NonNullable<LeadActivityCreate["interest_level"]> | ""
  >("");
  const [notes, setNotes] = React.useState("");
  const [followUpAt, setFollowUpAt] = React.useState("");
  const [loggingCall, setLoggingCall] = React.useState(false);
  const [updatingStatus, setUpdatingStatus] = React.useState(false);

  async function onLogCall(e: React.FormEvent) {
    e.preventDefault();
    if (!disposition) {
      toast.error("Choose a call outcome");
      return;
    }
    if (disposition === "connected" && !interestLevel) {
      toast.error("Choose an interest level", {
        description: "Required when the call connected.",
      });
      return;
    }
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
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-text-primary">{lead.name ?? "Unnamed lead"}</h1>
            <p className="text-sm text-text-secondary">{lead.mobile}</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={`tel:${lead.mobile}`}>
                <Phone className="h-4 w-4" />
                Call
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={toWaHref(lead.mobile)} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {STATUS_OPTIONS.map((o) => (
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
          <span
            className={cn(
              "ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium",
              lead.status === "converted"
                ? "bg-success/10 text-success"
                : "bg-muted text-text-secondary",
            )}
          >
            Current: {lead.status}
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold text-text-primary">Log a call</h2>
        <form className="mt-4 space-y-4" onSubmit={(e) => void onLogCall(e)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="disposition">Outcome</Label>
              <Select value={disposition} onValueChange={(v) => setDisposition(v as typeof disposition)}>
                <SelectTrigger id="disposition" className="w-full">
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
            </div>
            {disposition === "connected" ? (
              <div>
                <Label htmlFor="interest_level">Interest level</Label>
                <Select
                  value={interestLevel}
                  onValueChange={(v) => setInterestLevel(v as typeof interestLevel)}
                >
                  <SelectTrigger id="interest_level" className="w-full">
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
              </div>
            ) : (
              <div>
                <Label htmlFor="follow_up_at">Follow up at (optional)</Label>
                <input
                  id="follow_up_at"
                  type="datetime-local"
                  value={followUpAt}
                  onChange={(e) => setFollowUpAt(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              </div>
            )}
          </div>

          {disposition === "connected" ? (
            <div className="sm:w-1/2">
              <Label htmlFor="follow_up_at_connected">Follow up at (optional)</Label>
              <input
                id="follow_up_at_connected"
                type="datetime-local"
                value={followUpAt}
                onChange={(e) => setFollowUpAt(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
          ) : null}

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

          <Button type="submit" disabled={loggingCall}>
            {loggingCall ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Log call
          </Button>
        </form>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold text-text-primary">Call history</h2>
        {lead.activities.length === 0 ? (
          <p className="mt-3 text-sm text-text-secondary">No calls logged yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {lead.activities.map((a) => (
              <li key={a.id} className="rounded-xl border border-border p-3">
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
          </ul>
        )}
      </div>
    </div>
  );
}
