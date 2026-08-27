import * as React from "react";

import { listAuditLog, type AuditAction, type AuditLogEntry } from "@/lib/admin-api";

const PAGE_SIZE = 50;

export type AuditLogFilters = {
  action: AuditAction | "all";
  businessLine: "all" | "loans" | "real_estate";
  entityType: string;
  dateFrom: string;
  dateTo: string;
};

function startOfDay(value: string): string | undefined {
  return value ? new Date(`${value}T00:00:00`).toISOString() : undefined;
}

function endOfDay(value: string): string | undefined {
  return value ? new Date(`${value}T23:59:59.999`).toISOString() : undefined;
}

// The audit history is append-only, but its UI is intentionally page-based.
// Offset pagination makes the current result count and previous/next controls
// honest, and prevents a potentially unbounded DOM from accumulating in one tab.
export function useAuditLog(filters: AuditLogFilters) {
  const { action, businessLine, entityType, dateFrom, dateTo } = filters;
  const [entries, setEntries] = React.useState<AuditLogEntry[]>([]);
  const [total, setTotal] = React.useState(0);
  const [offset, setOffset] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const filterKey = [
    action,
    businessLine,
    entityType.trim(),
    dateFrom,
    dateTo,
  ].join("|");

  React.useEffect(() => {
    setOffset(0);
  }, [filterKey]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listAuditLog({
      action: action === "all" ? undefined : action,
      businessLine: businessLine === "all" ? undefined : businessLine,
      entityType: entityType.trim() || undefined,
      since: startOfDay(dateFrom),
      until: endOfDay(dateTo),
      limit: PAGE_SIZE,
      offset,
    });
    if (res.ok) {
      setEntries(res.data.entries);
      setTotal(res.data.total);
    } else {
      setError(res.error);
    }
    setLoading(false);
  }, [action, businessLine, dateFrom, dateTo, entityType, offset]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return {
    entries,
    total,
    offset,
    loading,
    error,
    reload: load,
    page: Math.floor(offset / PAGE_SIZE),
    pageSize: PAGE_SIZE,
    setPage: (page: number) => setOffset(Math.max(0, page) * PAGE_SIZE),
    hasNextPage: offset + entries.length < total,
    hasPrevPage: offset > 0,
    nextPage: () => setOffset((current) => current + PAGE_SIZE),
    prevPage: () => setOffset((current) => Math.max(0, current - PAGE_SIZE)),
  };
}
