import * as React from "react";

import { listAuditLog, type AuditAction, type AuditLogEntry } from "@/lib/admin-api";

const PAGE_SIZE = 50;

// Same plain useState + useCallback shape as use-support-tickets-admin.ts, with
// one addition: this feed is append-paginated, so `loadMore` keeps the entries
// already on screen and appends the next page rather than replacing them.
// `total` comes from the server and ignores pagination, so "showing N of M" is
// honest even when the table has grown past the first page.
export function useAuditLog(action: AuditAction | "all") {
  const [entries, setEntries] = React.useState<AuditLogEntry[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listAuditLog({
      action: action === "all" ? undefined : action,
      limit: PAGE_SIZE,
      offset: 0,
    });
    if (res.ok) {
      setEntries(res.data.entries);
      setTotal(res.data.total);
    } else {
      setError(res.error);
    }
    setLoading(false);
  }, [action]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const loadMore = React.useCallback(async () => {
    setLoadingMore(true);
    const res = await listAuditLog({
      action: action === "all" ? undefined : action,
      limit: PAGE_SIZE,
      offset: entries.length,
    });
    if (res.ok) {
      // Concatenate by id rather than blindly appending: entries written between
      // the first request and this one shift the offset window, which would
      // otherwise duplicate a row on screen.
      setEntries((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        return [...prev, ...res.data.entries.filter((e) => !seen.has(e.id))];
      });
      setTotal(res.data.total);
    } else {
      setError(res.error);
    }
    setLoadingMore(false);
  }, [action, entries.length]);

  return {
    entries,
    total,
    loading,
    loadingMore,
    error,
    reload: load,
    loadMore,
    hasMore: entries.length < total,
  };
}
