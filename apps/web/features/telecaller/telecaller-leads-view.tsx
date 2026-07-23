"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PhoneCall } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { FetchError } from "@/features/dashboard/fetch-error";
import { cn } from "@/lib/utils";

import { useTelecallerLeads } from "./use-telecaller-leads";

const STATUS_STYLE: Record<string, string> = {
  new: "bg-muted text-text-secondary",
  assigned: "bg-brand-cta-tint text-brand-cta",
  working: "bg-warning/10 text-warning",
  converted: "bg-success/10 text-success",
  closed: "bg-muted text-text-secondary",
  released: "bg-muted text-text-secondary",
};

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  assigned: "Assigned",
  working: "Working",
  converted: "Converted",
  closed: "Closed",
  released: "Released",
};

const DISPOSITION_LABEL: Record<string, string> = {
  connected: "Connected",
  no_answer: "No answer",
  busy: "Busy",
  switched_off: "Switched off",
  wrong_number: "Wrong number",
  callback_requested: "Callback requested",
  not_interested: "Not interested",
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

// The telecaller's assigned-lead list. Row click opens the lead detail page,
// where a call gets logged and status/requirement updated.
export function TelecallerLeadsView() {
  const router = useRouter();
  const { items, loading, error, reload } = useTelecallerLeads();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Leads</h1>
        <p className="text-sm text-text-secondary">Leads assigned to you. Open one to log a call.</p>
      </div>

      {loading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : error ? (
        <FetchError status={null} message={error} onRetry={() => void reload()} />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-text-secondary">
            <PhoneCall className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="mt-5 text-lg font-semibold text-text-primary">No leads assigned yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
            Leads assigned to you by Admin will show up here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="px-5 py-3 font-medium">Lead</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Last disposition</th>
                <th className="px-5 py-3 font-medium">Next follow-up</th>
              </tr>
            </thead>
            <tbody>
              {items.map((lead) => (
                <tr
                  key={lead.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") router.push(`/dashboard/leads/${lead.id}`);
                  }}
                  className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                >
                  <td className="px-5 py-4">
                    <p className="font-medium text-text-primary">{lead.name ?? "Unnamed lead"}</p>
                    <p className="text-xs text-text-secondary">{lead.mobile}</p>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                        STATUS_STYLE[lead.status] ?? "bg-muted text-text-secondary",
                      )}
                    >
                      {STATUS_LABEL[lead.status] ?? lead.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-text-secondary">
                    {lead.last_disposition ? DISPOSITION_LABEL[lead.last_disposition] : "Not called yet"}
                  </td>
                  <td className="px-5 py-4 text-text-secondary">
                    {formatDateTime(lead.next_follow_up_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
