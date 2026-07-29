// Pure helpers for the admin analytics & reporting UI (FR-16.1-16.3). Kept
// framework-free and side-effect-free so they can be unit tested directly
// (reports.test.ts) -- this app has no component tests, only pure-function
// ones, matching every other lib/*.test.ts file in this repo.

import type { ReportBucket, SortDir } from "@/lib/reports-api";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

function isoFromParts(y: number, m0: number, d: number): string {
  return `${pad(y, 4)}-${pad(m0 + 1, 2)}-${pad(d, 2)}`;
}

// India has no DST, so a fixed +5:30 shift is exact (not an approximation
// that could drift on a particular date the way real timezone-database
// lookups would for zones with seasonal offsets).
function toIstParts(date: Date): { y: number; m0: number; d: number; isoWeekday: number } {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  const weekday = shifted.getUTCDay(); // 0=Sun..6=Sat
  return {
    y: shifted.getUTCFullYear(),
    m0: shifted.getUTCMonth(),
    d: shifted.getUTCDate(),
    isoWeekday: weekday === 0 ? 7 : weekday, // 1=Mon..7=Sun
  };
}

/** The IST calendar date (YYYY-MM-DD) a UTC instant falls on. */
export function toIsoDateIST(date: Date): string {
  const { y, m0, d } = toIstParts(date);
  return isoFromParts(y, m0, d);
}

export type DatePreset = "this_week" | "this_month" | "last_30_days";

/** Resolves a preset to an inclusive [dateFrom, dateTo] pair, both IST
 * calendar dates, anchored on `now`. "This week" is ISO (Monday-start),
 * matching the backend's date_trunc('week', ...) bucketing. */
export function resolveDatePreset(preset: DatePreset, now: Date): { dateFrom: string; dateTo: string } {
  const { y, m0, d, isoWeekday } = toIstParts(now);
  const todayUtcMidnight = Date.UTC(y, m0, d);
  const dateTo = isoFromParts(y, m0, d);

  if (preset === "last_30_days") {
    const from = new Date(todayUtcMidnight - 29 * DAY_MS);
    return { dateFrom: isoFromParts(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()), dateTo };
  }
  if (preset === "this_month") {
    return { dateFrom: isoFromParts(y, m0, 1), dateTo };
  }
  const monday = new Date(todayUtcMidnight - (isoWeekday - 1) * DAY_MS);
  return {
    dateFrom: isoFromParts(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate()),
    dateTo,
  };
}

/** total=0 must render as an em dash, never "NaN%" or "0/0". */
export function formatConversionRate(total: number, converted: number): string {
  if (total <= 0) return "—";
  return `${Math.round((converted / total) * 1000) / 10}%`;
}

export type ReportParamsInput = {
  dateFrom: string;
  dateTo: string;
  bucket?: ReportBucket;
  businessLine?: string;
  agentProfileUuids?: string[];
  sortBy?: string;
  sortDir?: SortDir;
  limit?: number;
  offset?: number;
};

export function buildReportParams(filters: ReportParamsInput): URLSearchParams {
  const params = new URLSearchParams();
  params.set("date_from", filters.dateFrom);
  params.set("date_to", filters.dateTo);
  if (filters.bucket) params.set("bucket", filters.bucket);
  if (filters.businessLine) params.set("business_line", filters.businessLine);
  for (const id of filters.agentProfileUuids ?? []) params.append("agent_profile_uuid", id);
  if (filters.sortBy) params.set("sort_by", filters.sortBy);
  if (filters.sortDir) params.set("sort_dir", filters.sortDir);
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  if (filters.offset !== undefined) params.set("offset", String(filters.offset));
  return params;
}

/** Clicking the currently-sorted column flips direction; clicking a new one
 * selects it, defaulting to descending (the useful default for every count
 * column this UI has -- "biggest first"). */
export function nextSort(
  current: { sortBy: string | undefined; sortDir: SortDir },
  column: string,
): { sortBy: string; sortDir: SortDir } {
  if (current.sortBy === column) {
    return { sortBy: column, sortDir: current.sortDir === "desc" ? "asc" : "desc" };
  }
  return { sortBy: column, sortDir: "desc" };
}
