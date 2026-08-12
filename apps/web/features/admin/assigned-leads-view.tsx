"use client";

import * as React from "react";
import { Loader2, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminPagination, ADMIN_PAGE_SIZE, isInDateRange } from "./admin-list-tools";
import { LeadDetailsDialog } from "./lead-details-dialog";
import { useAdminAssignedLeads } from "./use-admin-assigned-leads";

const LINE_LABEL: Record<string, string> = { loans: "Loans", real_estate: "Real Estate" };
const ORIGIN_LABEL: Record<string, string> = { direct: "Direct", agent: "Agent referral" };
const STATUS_LABEL: Record<string, string> = { assigned: "Assigned", working: "Working" };

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "Unknown date"
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function AssignedLeadsView() {
  const { leads, loading, error, reload } = useAdminAssignedLeads();
  const [businessLine, setBusinessLine] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(0);
  const filtered = React.useMemo(() => leads.filter((lead) => (
    (businessLine === "all" || lead.business_line === businessLine) &&
    (status === "all" || lead.status === status) &&
    isInDateRange(lead.created_at, dateFrom, dateTo) &&
    `${lead.name ?? ""} ${lead.assigned_telecaller_name ?? ""} ${lead.assigned_telecaller_staff_code ?? ""}`.toLowerCase().includes(search.toLowerCase())
  )), [businessLine, dateFrom, dateTo, leads, search, status]);
  React.useEffect(() => setPage(0), [businessLine, dateFrom, dateTo, search, status]);
  const pageLeads = filtered.slice(page * ADMIN_PAGE_SIZE, (page + 1) * ADMIN_PAGE_SIZE);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Lead assignments</h1>
        <p className="text-sm text-text-secondary">
          Read-only view of each customer lead and its assigned Telecaller.
        </p>
      </div>

      <div className="grid gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-5">
        <Input aria-label="Search lead assignments" placeholder="Lead or Telecaller" value={search} onChange={(event) => setSearch(event.target.value)} />
        <Select value={businessLine} onValueChange={setBusinessLine}><SelectTrigger aria-label="Filter lead assignments by line"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All lines</SelectItem><SelectItem value="loans">Loans</SelectItem><SelectItem value="real_estate">Real Estate</SelectItem></SelectContent></Select>
        <Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="Filter lead assignments by status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="assigned">Assigned</SelectItem><SelectItem value="working">Working</SelectItem></SelectContent></Select>
        <Input aria-label="Lead assignments from date" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        <Input aria-label="Lead assignments to date" type="date" min={dateFrom || undefined} value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-border bg-card py-16">
          <Loader2 className="h-6 w-6 animate-spin text-brand-navy" aria-label="Loading assignments" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-text-secondary">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => void reload()}>
            Try again
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-12 text-center">
          <Users className="h-8 w-8 text-text-secondary" aria-hidden="true" />
          <p className="mt-3 font-medium text-text-primary">No assigned leads</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {pageLeads.map((lead) => (
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
                    <Badge variant="destructive">Awaiting automatic repair</Badge>
                  )}
                </div>
                <p className="text-sm text-text-primary">{lead.name ?? "Unnamed lead"}</p>
                <p className="text-xs text-text-secondary">
                  {lead.mobile} · {formatDate(lead.created_at)}
                </p>
                <p className="text-xs text-text-secondary">
                  {lead.assigned_telecaller_name
                    ? `Telecaller: ${lead.assigned_telecaller_name} (${lead.assigned_telecaller_staff_code})`
                    : "No active Telecaller currently attached"}
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
      {!loading && !error && filtered.length > 0 ? <AdminPagination page={page} total={filtered.length} onPageChange={setPage} /> : null}
    </div>
  );
}
