"use client";

import * as React from "react";
import {
  Archive,
  Ban,
  BadgeCheck,
  Banknote,
  CarFront,
  CircleSlash,
  ClipboardList,
  Eraser,
  FileCheck2,
  FilePenLine,
  Headset,
  Home,
  IndianRupee,
  Landmark,
  Loader2,
  Megaphone,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  UserMinus,
  UserPlus,
  Undo2,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AuditAction, AuditLogEntry } from "@/lib/admin-api";
import { cn } from "@/lib/utils";
import { useAuditLog } from "./use-audit-log";

// One entry per value of models/audit_log.py::AuditAction. Kept in sync by hand,
// the same way support-tickets-view.tsx mirrors the status machine: the enum is
// small and stable, and the wire response carries no display label. A missing
// key is a TypeScript error rather than a blank cell, because AuditAction comes
// from the generated contract.
const ACTION_META: Record<AuditAction, { label: string; icon: LucideIcon; tone: string }> = {
  agent_approved: {
    label: "Partner approved",
    icon: BadgeCheck,
    tone: "bg-success/10 text-success",
  },
  agent_rejected: { label: "Partner rejected", icon: Ban, tone: "bg-error/10 text-error" },
  staff_created: { label: "Staff account created", icon: UserPlus, tone: "bg-loans-soft text-loans-accent" },
  staff_feature_granted: {
    label: "Staff access granted",
    icon: ShieldCheck,
    tone: "bg-success/10 text-success",
  },
  staff_feature_revoked: {
    label: "Staff access revoked",
    icon: ShieldCheck,
    tone: "bg-warning/10 text-warning",
  },
  account_removed: { label: "Account removed", icon: UserMinus, tone: "bg-error/10 text-error" },
  account_status_updated: {
    label: "Account status updated",
    icon: ShieldCheck,
    tone: "bg-warning/10 text-warning",
  },
  payout_approved: { label: "Payout approved", icon: Wallet, tone: "bg-success/10 text-success" },
  payout_rejected: { label: "Payout rejected", icon: CircleSlash, tone: "bg-error/10 text-error" },
  payout_manual_issued: {
    label: "Cheque payout issued",
    icon: Banknote,
    tone: "bg-warning/10 text-warning",
  },
  payout_manual_cleared: {
    label: "Cheque payout cleared",
    icon: BadgeCheck,
    tone: "bg-success/10 text-success",
  },
  payout_manual_failed: {
    label: "Cheque payout failed",
    icon: CircleSlash,
    tone: "bg-error/10 text-error",
  },
  payout_manual_reversed: {
    label: "Cheque payout reversed",
    icon: Undo2,
    tone: "bg-error/10 text-error",
  },
  property_submission_approved: {
    label: "Listing approved",
    icon: Home,
    tone: "bg-success/10 text-success",
  },
  property_submission_rejected: {
    label: "Listing rejected",
    icon: Home,
    tone: "bg-error/10 text-error",
  },
  property_listing_updated: {
    label: "Listing availability updated",
    icon: Home,
    tone: "bg-warning/10 text-warning",
  },
  support_ticket_advanced: {
    label: "Support ticket updated",
    icon: Headset,
    tone: "bg-loans-soft text-loans-accent",
  },
  retention_purged: {
    label: "Records purged",
    icon: Eraser,
    tone: "bg-muted text-text-secondary",
  },
  loan_type_created: {
    label: "Loan type added",
    icon: SlidersHorizontal,
    tone: "bg-loans-soft text-loans-accent",
  },
  loan_type_updated: {
    label: "Loan type updated",
    icon: SlidersHorizontal,
    tone: "bg-loans-soft text-loans-accent",
  },
  bank_created: {
    label: "Bank added",
    icon: Landmark,
    tone: "bg-loans-soft text-loans-accent",
  },
  bank_updated: {
    label: "Bank updated",
    icon: Landmark,
    tone: "bg-loans-soft text-loans-accent",
  },
  bank_availability_updated: {
    label: "Bank availability updated",
    icon: Landmark,
    tone: "bg-loans-soft text-loans-accent",
  },
  commission_entered: {
    label: "Commission entered",
    icon: IndianRupee,
    tone: "bg-success/10 text-success",
  },
  commission_cancelled: {
    label: "Commission cancelled",
    icon: IndianRupee,
    tone: "bg-muted text-text-secondary",
  },
  fee_cashback_entered: {
    label: "Fee cashback entered",
    icon: Banknote,
    tone: "bg-success/10 text-success",
  },
  fee_cashback_cancelled: {
    label: "Fee cashback cancelled",
    icon: Banknote,
    tone: "bg-muted text-text-secondary",
  },
  document_verified: {
    label: "Document verified",
    icon: FileCheck2,
    tone: "bg-success/10 text-success",
  },
  document_unverified: {
    label: "Document sent back for re-collection",
    icon: FileCheck2,
    tone: "bg-warning/10 text-warning",
  },
  payout_link_reconciled: {
    label: "Payout link auto-repaired",
    icon: RefreshCw,
    tone: "bg-muted text-text-secondary",
  },
  notification_broadcast: {
    label: "Broadcast sent",
    icon: Megaphone,
    tone: "bg-loans-soft text-loans-accent",
  },
  agent_lead_expired: {
    label: "Agent lead expired",
    icon: Undo2,
    tone: "bg-warning/10 text-warning",
  },
  lead_assigned: {
    label: "Lead assigned",
    icon: Headset,
    tone: "bg-loans-soft text-loans-accent",
  },
  employee_work_assigned: {
    label: "Employee work assigned",
    icon: ClipboardList,
    tone: "bg-realestate-soft text-realestate-accent",
  },
  lead_details_updated: {
    label: "Lead details corrected",
    icon: FilePenLine,
    tone: "bg-warning/10 text-warning",
  },
  field_visibility_updated: {
    label: "Field visibility updated",
    icon: ShieldCheck,
    tone: "bg-loans-soft text-loans-accent",
  },
  mobile_change_verified: {
    label: "Mobile change identity verified",
    icon: BadgeCheck,
    tone: "bg-warning/10 text-warning",
  },
  mobile_changed: {
    label: "Login number changed",
    icon: ShieldCheck,
    tone: "bg-success/10 text-success",
  },
  mobile_change_rejected: {
    label: "Mobile change rejected",
    icon: Ban,
    tone: "bg-error/10 text-error",
  },
  banner_created: {
    label: "Banner created",
    icon: Megaphone,
    tone: "bg-loans-soft text-loans-accent",
  },
  banner_updated: {
    label: "Banner updated",
    icon: FilePenLine,
    tone: "bg-loans-soft text-loans-accent",
  },
  banner_submitted: {
    label: "Banner submitted",
    icon: ScrollText,
    tone: "bg-warning/10 text-warning",
  },
  banner_approved: {
    label: "Banner approved",
    icon: BadgeCheck,
    tone: "bg-success/10 text-success",
  },
  banner_rejected: {
    label: "Banner rejected",
    icon: Ban,
    tone: "bg-error/10 text-error",
  },
  banner_archived: {
    label: "Banner archived",
    icon: Archive,
    tone: "bg-muted text-text-secondary",
  },
  banner_activated: {
    label: "Banner activated",
    icon: Megaphone,
    tone: "bg-success/10 text-success",
  },
  banner_deleted: {
    label: "Banner draft deleted",
    icon: Eraser,
    tone: "bg-muted text-text-secondary",
  },
  banner_template_versioned: {
    label: "Banner artwork versioned",
    icon: RefreshCw,
    tone: "bg-loans-soft text-loans-accent",
  },
  vehicle_arrangement_updated: {
    label: "Vehicle arrangement updated",
    icon: CarFront,
    tone: "bg-realestate-soft text-realestate-accent",
  },
};

const FILTER_OPTIONS: { value: AuditAction | "all"; label: string }[] = [
  { value: "all", label: "All activity" },
  ...(Object.keys(ACTION_META) as AuditAction[]).map((a) => ({
    value: a,
    label: ACTION_META[a].label,
  })),
];

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  sub_admin: "Sub Admin",
  agent: "Partner",
  telecaller: "Telecaller",
  employee: "Employee",
  client: "Client",
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// A NULL actor means platform automation acted. A present actor_uuid that resolved to
// no name means the account was deleted since. Two different facts, two different
// words, so the feed never implies a person did something the platform did.
function actorLabel(entry: AuditLogEntry): string {
  if (entry.actor_uuid === null) return "Platform automation";
  if (entry.actor_name) return entry.actor_name;
  return "Deleted account";
}

function DetailRows({ detail }: { detail: Record<string, unknown> }) {
  const rows = Object.entries(detail);
  if (rows.length === 0) {
    return <p className="text-sm text-text-secondary">No extra detail was recorded.</p>;
  }
  return (
    <dl className="divide-y divide-border overflow-hidden rounded-lg border border-border">
      {rows.map(([key, value]) => (
        <div key={key} className="grid gap-1 p-3 sm:grid-cols-3 sm:gap-3">
          <dt className="text-xs font-medium text-text-secondary sm:col-span-1">
            {key.replace(/_/g, " ")}
          </dt>
          <dd className="min-w-0 break-words text-sm text-text-primary sm:col-span-2">
            {value === null || value === undefined ? (
              <span className="text-text-secondary">not set</span>
            ) : typeof value === "object" ? (
              <pre className="overflow-x-auto whitespace-pre-wrap text-xs">
                {JSON.stringify(value, null, 2)}
              </pre>
            ) : (
              String(value)
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function AuditLogView() {
  const [action, setAction] = React.useState<AuditAction | "all">("all");
  const [businessLine, setBusinessLine] = React.useState<"all" | "loans" | "real_estate">("all");
  const [entityType, setEntityType] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const { entries, total, offset, loading, error, reload, hasNextPage, hasPrevPage, nextPage, prevPage } =
    useAuditLog({ action, businessLine, entityType, dateFrom, dateTo });
  const [active, setActive] = React.useState<AuditLogEntry | null>(null);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Activity log</h1>
          <p className="text-sm text-text-secondary">
            Every business action taken on the platform, in order. Entries can be added but never
            edited or removed.
          </p>
        </div>
        <div className="grid w-full gap-2 sm:grid-cols-2 xl:w-auto xl:grid-cols-5">
          <Select value={action} onValueChange={(v) => setAction(v as AuditAction | "all")}>
            <SelectTrigger aria-label="Filter activity by action">
              <SelectValue placeholder="All activity" />
            </SelectTrigger>
            <SelectContent>
              {FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={businessLine} onValueChange={(value) => setBusinessLine(value as typeof businessLine)}>
            <SelectTrigger aria-label="Filter activity by business line"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All lines</SelectItem>
              <SelectItem value="loans">Loans</SelectItem>
              <SelectItem value="real_estate">Real Estate</SelectItem>
            </SelectContent>
          </Select>
          <Input aria-label="Filter activity by record type" placeholder="Record type" value={entityType} onChange={(event) => setEntityType(event.target.value)} />
          <Input aria-label="Filter activity from date" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <Input aria-label="Filter activity to date" type="date" min={dateFrom || undefined} value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </div>
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
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-12 text-center">
          <ScrollText className="h-8 w-8 text-text-secondary" aria-hidden="true" />
          <p className="mt-3 font-medium text-text-primary">
            {action === "all"
              ? "Nothing has been recorded yet."
              : "No activity of this kind yet."}
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Approvals, payouts, and account removals show up here as they happen.
          </p>
        </div>
      ) : (
        <>
          <ul className="overflow-hidden rounded-2xl border border-border bg-card divide-y divide-border">
            {entries.map((e) => {
              const meta = ACTION_META[e.action];
              const Icon = meta.icon;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setActive(e)}
                    className="flex w-full items-start gap-4 p-4 text-left transition-colors hover:bg-muted/30"
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                        meta.tone,
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-text-primary">{meta.label}</p>
                      <p className="mt-0.5 text-xs text-text-secondary">
                        {actorLabel(e)}
                        {e.actor_role ? ` (${ROLE_LABEL[e.actor_role] ?? e.actor_role})` : ""}
                        {" · "}
                        {formatWhen(e.created_at)}
                      </p>
                    </div>
                    {e.business_line ? (
                      <Badge variant="outline" className="shrink-0 capitalize">
                        {e.business_line.replace("_", " ")}
                      </Badge>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-text-secondary">
              Showing {offset + 1}-{offset + entries.length} of {total}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={prevPage} disabled={!hasPrevPage}>Previous</Button>
              <Button variant="outline" size="sm" onClick={nextPage} disabled={!hasNextPage}>Next</Button>
            </div>
          </div>
        </>
      )}

      <Dialog open={active !== null} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-lg">
          {active ? (
            <>
              <DialogHeader>
                <DialogTitle>{ACTION_META[active.action].label}</DialogTitle>
                <DialogDescription>
                  {actorLabel(active)}
                  {active.actor_role
                    ? ` (${ROLE_LABEL[active.actor_role] ?? active.actor_role})`
                    : ""}
                  {" · "}
                  {formatWhen(active.created_at)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid gap-1 text-sm sm:grid-cols-3 sm:gap-3">
                  <span className="text-xs font-medium text-text-secondary">record</span>
                  <span className="min-w-0 break-words sm:col-span-2">
                    {active.entity_type.replace(/_/g, " ")}
                    {active.entity_uuid ? (
                      <span className="ml-1 font-mono text-xs text-text-secondary">
                        {active.entity_uuid}
                      </span>
                    ) : null}
                  </span>
                </div>
                <DetailRows detail={(active.detail ?? {}) as Record<string, unknown>} />
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
