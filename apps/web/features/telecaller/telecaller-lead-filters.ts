// Pure search/filter/sort helpers for the telecaller leads table, kept
// framework-free so they're unit-testable without mounting the view. Mirrors
// the shape of features/admin/operational-records-filter.ts.

import { isInDateRange } from "@/lib/date-range";
import type { TelecallerLead } from "@/lib/telecaller-api";

import { DISPOSITION_LABEL, STATUS_LABEL } from "./telecaller-lead-status";

export type TelecallerLeadFilters = {
  search: string;
  status: string; // "all" | TelecallerLead["status"]
  followUpFrom: string; // "YYYY-MM-DD"
  followUpTo: string; // "YYYY-MM-DD"
};

export const DEFAULT_TELECALLER_LEAD_FILTERS: TelecallerLeadFilters = {
  search: "",
  status: "all",
  followUpFrom: "",
  followUpTo: "",
};

export function filterTelecallerLeads(
  leads: TelecallerLead[],
  filters: TelecallerLeadFilters,
): TelecallerLead[] {
  const query = filters.search.trim().toLocaleLowerCase();
  return leads.filter((lead) => {
    if (filters.status !== "all" && lead.status !== filters.status) return false;
    if (!isInDateRange(lead.next_follow_up_at, filters.followUpFrom, filters.followUpTo)) return false;
    if (!query) return true;
    return `${lead.name ?? ""} ${lead.mobile}`.toLocaleLowerCase().includes(query);
  });
}

export type TelecallerLeadSortKey = "name" | "status" | "last_disposition" | "next_follow_up_at";
export type TelecallerLeadSort = { key: TelecallerLeadSortKey; dir: "asc" | "desc" };

// Default landing sort: whichever lead is due soonest floats to the top, and
// leads never called sink to the bottom — the most actionable order for a
// telecaller starting their day.
export const DEFAULT_TELECALLER_LEAD_SORT: TelecallerLeadSort = {
  key: "next_follow_up_at",
  dir: "asc",
};

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b);
}

// Missing follow-ups always sink to the bottom, independent of sort direction
// — there's never a reason to lead the queue with leads that have no
// scheduled callback.
function compareFollowUp(
  a: string | null | undefined,
  b: string | null | undefined,
  dirMul: number,
): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return dirMul * (new Date(a).getTime() - new Date(b).getTime());
}

export function sortTelecallerLeads(
  leads: TelecallerLead[],
  sort: TelecallerLeadSort,
): TelecallerLead[] {
  const dirMul = sort.dir === "asc" ? 1 : -1;
  return [...leads].sort((a, b) => {
    switch (sort.key) {
      case "name":
        return dirMul * compareStrings(a.name ?? "", b.name ?? "");
      case "status":
        return dirMul * compareStrings(STATUS_LABEL[a.status] ?? a.status, STATUS_LABEL[b.status] ?? b.status);
      case "last_disposition":
        return (
          dirMul *
          compareStrings(
            a.last_disposition ? DISPOSITION_LABEL[a.last_disposition] ?? a.last_disposition : "",
            b.last_disposition ? DISPOSITION_LABEL[b.last_disposition] ?? b.last_disposition : "",
          )
        );
      case "next_follow_up_at":
        return compareFollowUp(a.next_follow_up_at, b.next_follow_up_at, dirMul);
      default:
        return 0;
    }
  });
}
