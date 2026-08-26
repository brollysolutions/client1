// Shared status/disposition vocabulary for the telecaller leads table and lead
// detail page — one set of maps, no drift between the two screens.

import type { LeadActivityCreate } from "@/lib/telecaller-api";

export const STATUS_STYLE: Record<string, string> = {
  new: "bg-muted text-text-secondary",
  assigned: "bg-brand-cta-tint text-brand-cta",
  working: "bg-warning/10 text-warning",
  converted: "bg-success/10 text-success",
  closed: "bg-muted text-text-secondary",
  released: "bg-muted text-text-secondary",
};

export const STATUS_LABEL: Record<string, string> = {
  new: "New",
  assigned: "Assigned",
  working: "Working",
  converted: "Converted",
  closed: "Closed",
  released: "Released",
};

export const DISPOSITION_LABEL: Record<string, string> = {
  connected: "Connected",
  no_answer: "No answer",
  busy: "Busy",
  switched_off: "Switched off",
  wrong_number: "Wrong number",
  callback_requested: "Callback requested",
  not_interested: "Not interested",
};

export const DISPOSITION_OPTIONS: { value: LeadActivityCreate["disposition"]; label: string }[] = [
  { value: "connected", label: DISPOSITION_LABEL.connected },
  { value: "no_answer", label: DISPOSITION_LABEL.no_answer },
  { value: "busy", label: DISPOSITION_LABEL.busy },
  { value: "switched_off", label: DISPOSITION_LABEL.switched_off },
  { value: "wrong_number", label: DISPOSITION_LABEL.wrong_number },
  { value: "callback_requested", label: DISPOSITION_LABEL.callback_requested },
  { value: "not_interested", label: DISPOSITION_LABEL.not_interested },
];

export const INTEREST_OPTIONS: { value: NonNullable<LeadActivityCreate["interest_level"]>; label: string }[] = [
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "cold", label: "Cold" },
];

export const LEAD_STATUS_OPTIONS: { value: "working" | "converted" | "closed"; label: string }[] = [
  { value: "working", label: "Working" },
  { value: "converted", label: "Converted" },
  { value: "closed", label: "Closed" },
];

// Call-history timeline dot color, keyed off the outcome of that call.
export function dispositionDotClass(disposition: string | null | undefined): string {
  if (disposition === "connected") return "bg-success";
  if (disposition === "not_interested" || disposition === "wrong_number") return "bg-destructive";
  if (disposition === "callback_requested") return "bg-warning";
  return "bg-muted-foreground";
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
