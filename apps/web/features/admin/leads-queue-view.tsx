"use client";

import * as React from "react";
import { CheckCircle2, Loader2, UserPlus } from "lucide-react";
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
import { assignLead, type AdminLead } from "@/lib/admin-api";
import { LeadDetailsDialog } from "./lead-details-dialog";
import { useAdminLeadsQueue } from "./use-admin-leads";

const LINE_LABEL: Record<string, string> = {
  loans: "Loans",
  real_estate: "Real Estate",
};

const ORIGIN_LABEL: Record<string, string> = {
  direct: "Direct",
  agent: "Agent referral",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "Unknown date"
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function LeadsQueueView() {
  const { leads, telecallers, loading, error, reload } = useAdminLeadsQueue();
  const [active, setActive] = React.useState<AdminLead | null>(null);
  const [selectedTelecaller, setSelectedTelecaller] = React.useState<string>("");
  const [busy, setBusy] = React.useState(false);

  const eligibleTelecallers = React.useMemo(
    () => telecallers.filter((t) => t.business_line === active?.business_line),
    [telecallers, active],
  );

  function openAssign(lead: AdminLead) {
    setActive(lead);
    setSelectedTelecaller("");
  }

  async function onAssign() {
    if (!active || !selectedTelecaller) return;
    setBusy(true);
    const res = await assignLead(active.id, selectedTelecaller);
    setBusy(false);
    if (res.ok) {
      toast.success("Lead assigned");
      setActive(null);
      void reload();
    } else {
      toast.error("Could not assign lead", { description: res.error });
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Unassigned leads</h1>
        <p className="text-sm text-text-secondary">
          Hand each lead to an active telecaller on the matching business line.
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
          <UserPlus className="h-8 w-8 text-text-secondary" aria-hidden="true" />
          <p className="mt-3 font-medium text-text-primary">No unassigned leads</p>
          <p className="mt-1 text-sm text-text-secondary">
            New leads with a resolved business line will show up here.
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
                </div>
                <p className="text-sm text-text-primary">{lead.name ?? "Unnamed lead"}</p>
                <p className="text-xs text-text-secondary">
                  {lead.mobile} · {formatDate(lead.created_at)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <LeadDetailsDialog
                  leadId={lead.id}
                  leadName={lead.name}
                  onSaved={() => void reload()}
                />
                <Button onClick={() => openAssign(lead)}>Assign</Button>
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

              <div className="space-y-2">
                <Select value={selectedTelecaller} onValueChange={setSelectedTelecaller}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a telecaller" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleTelecallers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.first_name} {t.last_name} ({t.staff_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {eligibleTelecallers.length === 0 ? (
                  <p className="text-xs text-text-secondary">
                    No active telecallers on this business line.
                  </p>
                ) : null}
              </div>

              <DialogFooter>
                <Button onClick={() => void onAssign()} disabled={busy || !selectedTelecaller}>
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Assign
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
