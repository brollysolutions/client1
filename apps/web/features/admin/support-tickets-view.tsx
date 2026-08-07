"use client";

import * as React from "react";
import { Headset, Loader2 } from "lucide-react";
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
import { advanceSupportTicket, type SupportTicketAdmin } from "@/lib/admin-api";
import { CATEGORY_LABEL, STATUS_STYLES, type SupportStatus } from "@/lib/support-tickets";
import { cn } from "@/lib/utils";
import { useSupportTicketsAdmin } from "./use-support-tickets-admin";
import { MobileChangeQueue } from "./mobile-change-queue";

// Mirrors services/support_tickets.py::_TRANSITIONS exactly. Kept in sync by
// hand (small, stable enum) rather than derived from the wire response --
// there is no "legal next statuses" field on SupportTicketAdminRead.
const TRANSITIONS: Record<SupportStatus, Exclude<SupportStatus, "open">[]> = {
  open: ["in_progress", "closed"],
  in_progress: ["resolved", "closed"],
  resolved: ["closed"],
  closed: [],
};

// "open" is never a legal transition TARGET (no reopen path in TRANSITIONS
// above), so it's deliberately excluded here rather than carrying a dead
// "Reopen" label that could never render.
const ACTION_LABEL: Record<Exclude<SupportStatus, "open">, string> = {
  in_progress: "Mark in progress",
  resolved: "Mark resolved",
  closed: "Close",
};

const FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
  { value: "", label: "All" },
];

export function SupportTicketsView() {
  const { items, loading, error, reload } = useSupportTicketsAdmin();
  const [statusFilter, setStatusFilter] = React.useState("open");
  const [active, setActive] = React.useState<SupportTicketAdmin | null>(null);
  const [note, setNote] = React.useState("");
  const [busyStatus, setBusyStatus] = React.useState<SupportStatus | null>(null);

  const visible = statusFilter ? items.filter((t) => t.status === statusFilter) : items;

  async function onAdvance(ticket: SupportTicketAdmin, target: SupportStatus) {
    setBusyStatus(target);
    const res = await advanceSupportTicket(ticket.id, {
      status: target,
      resolution_note: note.trim() || null,
    });
    setBusyStatus(null);
    if (res.ok) {
      toast.success(`Ticket marked ${STATUS_STYLES[target].label.toLowerCase()}`);
      setActive(null);
      setNote("");
      void reload();
    } else {
      toast.error("Could not update ticket", { description: res.error });
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Support tickets</h1>
          <p className="text-sm text-text-secondary">
            Login, OTP, and lost-mobile requests are handled here exclusively.
          </p>
        </div>
        <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Open" />
          </SelectTrigger>
          <SelectContent>
            {FILTER_OPTIONS.map((o) => (
              <SelectItem key={o.value || "all"} value={o.value || "all"}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <MobileChangeQueue />

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
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-12 text-center">
          <Headset className="h-8 w-8 text-text-secondary" aria-hidden="true" />
          <p className="mt-3 font-medium text-text-primary">
            {statusFilter === "open" ? "No open tickets." : "No tickets match this filter."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((t) => {
            const s = STATUS_STYLES[t.status];
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => {
                    setActive(t);
                    setNote("");
                  }}
                  className="flex w-full items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-brand-cta"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-text-primary">{t.subject}</p>
                    <p className="mt-0.5 truncate text-xs text-text-secondary">
                      {CATEGORY_LABEL[t.category]} · {t.requester_name ?? "Deleted account"}
                    </p>
                  </div>
                  <Badge className={cn("shrink-0", s.className)}>{s.label}</Badge>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={active !== null} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-lg">
          {active ? (
            <>
              <DialogHeader>
                <DialogTitle>{active.subject}</DialogTitle>
                <DialogDescription>
                  {CATEGORY_LABEL[active.category]} ·{" "}
                  {active.requester_name ?? "Deleted account"}
                  {active.requester_mobile ? ` · ${active.requester_mobile}` : ""}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <p className="whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-sm text-text-primary">
                  {active.body}
                </p>

                {active.resolution_note ? (
                  <div>
                    <p className="text-xs font-medium text-text-secondary">
                      Current internal note
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-text-primary">
                      {active.resolution_note}
                    </p>
                  </div>
                ) : null}

                {TRANSITIONS[active.status].length > 0 ? (
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="What did you tell the requester? (optional, staff-only)"
                    rows={3}
                  />
                ) : null}
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                {TRANSITIONS[active.status].length === 0 ? (
                  <p className="text-sm text-text-secondary">This ticket is closed.</p>
                ) : (
                  TRANSITIONS[active.status].map((target) => (
                    <Button
                      key={target}
                      variant={target === "closed" ? "outline" : "default"}
                      onClick={() => void onAdvance(active, target)}
                      disabled={busyStatus !== null}
                    >
                      {busyStatus === target ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      {ACTION_LABEL[target]}
                    </Button>
                  ))
                )}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
