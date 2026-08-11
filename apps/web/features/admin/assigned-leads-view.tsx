"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Users } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { releaseLead, type AdminAssignedLead } from "@/lib/admin-api";
import { LeadDetailsDialog } from "./lead-details-dialog";
import { useAdminAssignedLeads } from "./use-admin-assigned-leads";

const LINE_LABEL: Record<string, string> = {
  loans: "Loans",
  real_estate: "Real Estate",
};

const ORIGIN_LABEL: Record<string, string> = {
  direct: "Direct",
  agent: "Agent referral",
};

const STATUS_LABEL: Record<string, string> = {
  assigned: "Assigned",
  working: "Working",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "Unknown date"
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function AssignedLeadsView() {
  const { leads, telecallers, loading, error, reload } = useAdminAssignedLeads();
  const [active, setActive] = React.useState<AdminAssignedLead | null>(null);
  const [selectedTelecaller, setSelectedTelecaller] = React.useState<string>("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const eligibleTelecallers = React.useMemo(
    () =>
      telecallers.filter(
        (t) => t.business_line === active?.business_line && t.id !== active?.assigned_telecaller_staff_profile_uuid,
      ),
    [telecallers, active],
  );

  function openRelease(lead: AdminAssignedLead) {
    setActive(lead);
    setSelectedTelecaller("");
    setReason("");
  }

  async function onRelease() {
    if (!active) return;
    setBusy(true);
    const res = await releaseLead(active.id, selectedTelecaller || null, reason.trim() || null);
    setBusy(false);
    if (res.ok) {
      toast.success(selectedTelecaller ? "Lead reassigned" : "Lead released to queue");
      setActive(null);
      void reload();
    } else {
      toast.error("Could not release lead", { description: res.error });
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Assigned leads</h1>
        <p className="text-sm text-text-secondary">
          Release a lead back to the queue, or move it directly to a different telecaller.
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
      ) : leads.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-12 text-center">
          <Users className="h-8 w-8 text-text-secondary" aria-hidden="true" />
          <p className="mt-3 font-medium text-text-primary">No assigned leads</p>
          <p className="mt-1 text-sm text-text-secondary">
            Leads currently with a telecaller will show up here.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {leads.map((lead) => (
            <li
              key={lead.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{LINE_LABEL[lead.business_line] ?? lead.business_line}</Badge>
                  <Badge variant="secondary">{ORIGIN_LABEL[lead.origin] ?? lead.origin}</Badge>
                  <Badge variant="secondary">{STATUS_LABEL[lead.status] ?? lead.status}</Badge>
                  {lead.assigned_telecaller_staff_profile_uuid ? null : (
                    <Badge variant="destructive">Unassigned (needs repair)</Badge>
                  )}
                </div>
                <p className="text-sm text-text-primary">{lead.name ?? "Unnamed lead"}</p>
                <p className="text-xs text-text-secondary">
                  {lead.mobile} · {formatDate(lead.created_at)}
                </p>
                <p className="text-xs text-text-secondary">
                  {lead.assigned_telecaller_name
                    ? `With ${lead.assigned_telecaller_name} (${lead.assigned_telecaller_staff_code})`
                    : "No active telecaller on this lead"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <LeadDetailsDialog
                  leadId={lead.id}
                  leadName={lead.name}
                  onSaved={() => void reload()}
                />
                <Button onClick={() => openRelease(lead)}>Release / Reassign</Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={active !== null} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-lg">
          {active ? (
            <>
              <DialogHeader>
                <DialogTitle>{active.name ?? "Unnamed lead"}</DialogTitle>
                <DialogDescription>
                  {LINE_LABEL[active.business_line] ?? active.business_line} · {active.mobile}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Select value={selectedTelecaller} onValueChange={setSelectedTelecaller}>
                    <SelectTrigger>
                      <SelectValue placeholder="Release to queue (no telecaller)" />
                    </SelectTrigger>
                    <SelectContent>
                      {eligibleTelecallers.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.first_name} {t.last_name} ({t.staff_code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-text-secondary">
                    Leave unset to release this lead back to the unassigned queue, or pick a
                    telecaller to move it directly to them.
                  </p>
                </div>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason (optional)"
                  rows={3}
                />
              </div>

              <DialogFooter>
                <Button onClick={() => void onRelease()} disabled={busy}>
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {selectedTelecaller ? "Reassign" : "Release"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
