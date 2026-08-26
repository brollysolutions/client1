"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PhoneCall } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardHeader, DashboardPage, DashboardPanel } from "@/features/dashboard/dashboard-ui";
import { FetchError } from "@/features/dashboard/fetch-error";
import { formatMobile } from "@/lib/phone";
import { cn } from "@/lib/utils";

import { useAgentLeads } from "./use-agent-leads";
import { formatAgentLeadExpiry } from "./lead-expiry";

const STATUS_STYLE: Record<string, string> = {
  new: "bg-muted text-text-secondary",
  assigned: "bg-brand-cta-tint text-brand-cta",
  working: "bg-warning/10 text-warning",
  converted: "bg-success/10 text-success",
  closed: "bg-muted text-text-secondary",
  released: "bg-muted text-text-secondary",
  expired: "bg-destructive/10 text-destructive",
};

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  assigned: "Assigned",
  working: "Working",
  converted: "Converted",
  closed: "Closed",
  released: "Released",
  expired: "Expired",
};

// The agent's introduced-lead list. Row click opens the lead detail page,
// where the requirement can still be edited until a telecaller picks it up.
export function AgentLeadsView() {
  const router = useRouter();
  const { items, loading, error, reload } = useAgentLeads();

  return (
    <DashboardPage>
      <DashboardHeader
        title="Leads"
        description="Leads you have introduced."
        actions={
          <Button asChild className="bg-brand-cta text-white hover:bg-brand-cta/90">
            <Link href="/dashboard/leads/new">
              <PhoneCall className="h-4 w-4" aria-hidden="true" />
              Introduce a lead
            </Link>
          </Button>
        }
      />

      {loading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : error ? (
        <FetchError status={null} message={error} onRetry={() => void reload()} />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-text-secondary">
            <PhoneCall className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="mt-5 text-lg font-semibold text-text-primary">No leads introduced yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
            Introduce a lead to start tracking it here.
          </p>
        </div>
      ) : (
        <DashboardPanel title="Introduced leads" description="Tap a lead to view its details.">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
                <tr>
                  <th className="px-5 py-3 font-medium">Lead</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Registered</th>
                  <th className="px-5 py-3 font-medium">Agent window</th>
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
                      <p className="text-xs text-text-secondary">{formatMobile(lead.mobile)}</p>
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
                      {lead.registered ? "Account created" : "Not registered yet"}
                    </td>
                    <td className="px-5 py-4 text-xs text-text-secondary">
                      {formatAgentLeadExpiry(lead.status, lead.expires_at, lead.expired_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DashboardPanel>
      )}
    </DashboardPage>
  );
}
