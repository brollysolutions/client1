"use client";

import { Loader2, UserPlus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LeadDetailsDialog } from "./lead-details-dialog";
import { useAdminLeadsQueue } from "./use-admin-leads";

const LINE_LABEL: Record<string, string> = { loans: "Loans", real_estate: "Real Estate" };
const ORIGIN_LABEL: Record<string, string> = { direct: "Direct", agent: "Agent referral" };

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "Unknown date"
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function LeadsQueueView() {
  const { leads, loading, error, reload } = useAdminLeadsQueue();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Awaiting Telecaller capacity</h1>
        <p className="text-sm text-text-secondary">
          Read-only oversight. Matching Telecallers are assigned automatically.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-border bg-card py-16">
          <Loader2 className="h-6 w-6 animate-spin text-brand-navy" aria-label="Loading leads" />
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
          <p className="mt-3 font-medium text-text-primary">No leads awaiting capacity</p>
          <p className="mt-1 text-sm text-text-secondary">
            Eligible leads are assigned as soon as a matching Telecaller is available.
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
              <LeadDetailsDialog
                leadId={lead.id}
                leadName={lead.name}
                onSaved={() => void reload()}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
