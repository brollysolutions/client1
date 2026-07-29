import * as React from "react";

import { nextSort } from "@/lib/reports";
import {
  getReport,
  type AgentsReportResponse,
  type DealsReportResponse,
  type LeadsReportResponse,
  type LoansReportResponse,
  type ReportBucket,
  type ReportKind,
  type SortDir,
} from "@/lib/reports-api";

const PAGE_SIZE = 25;

export type ReportResponse =
  | LeadsReportResponse
  | LoansReportResponse
  | DealsReportResponse
  | AgentsReportResponse;

export type ReportFilterInput = {
  dateFrom: string;
  dateTo: string;
  bucket?: ReportBucket;
  businessLine?: string;
  agentProfileUuids?: string[];
};

// One generic hook parameterized by report kind rather than four
// near-duplicates (leads/loans/deals/agents share the same
// loading/sort/paginate shape) -- follows use-audit-log.ts's
// loading/error/data convention, plus server-side sort + offset pagination
// since FR-16.3 requires sorting over the FULL filtered set, not just the
// loaded page.
export function useReport(kind: ReportKind, filters: ReportFilterInput) {
  const [sortBy, setSortBy] = React.useState<string | undefined>(undefined);
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");
  const [offset, setOffset] = React.useState(0);
  const [data, setData] = React.useState<ReportResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const agentKey = (filters.agentProfileUuids ?? []).join(",");

  // A filter or sort change invalidates the current page -- reset to the
  // first page. This effect and the load effect below both react to the
  // same filter/sort deps, so on a real change React fires BOTH the same
  // commit: this queues setOffset(0), but `load`'s closure still captures
  // the OLD (pre-reset) offset in that same pass, firing one fetch with the
  // wrong page before firing a second, correct one once the reset commits.
  // requestIdRef below is what makes that harmless -- without it, the two
  // fetches race and whichever resolves last wins, which could silently
  // leave the table showing the wrong page under the new filter.
  React.useEffect(() => {
    setOffset(0);
  }, [kind, filters.dateFrom, filters.dateTo, filters.bucket, filters.businessLine, agentKey, sortBy, sortDir]);

  const requestIdRef = React.useRef(0);

  const load = React.useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    const res = await getReport(kind, {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      bucket: filters.bucket,
      businessLine: filters.businessLine,
      agentProfileUuids: filters.agentProfileUuids,
      sortBy,
      sortDir,
      limit: PAGE_SIZE,
      offset,
    });
    if (requestId !== requestIdRef.current) return; // a newer request has since superseded this one
    if (res.ok) {
      setData(res.data);
    } else {
      setError(res.error);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, filters.dateFrom, filters.dateTo, filters.bucket, filters.businessLine, agentKey, sortBy, sortDir, offset]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const toggleSort = React.useCallback(
    (column: string) => {
      const next = nextSort({ sortBy, sortDir }, column);
      setSortBy(next.sortBy);
      setSortDir(next.sortDir);
    },
    [sortBy, sortDir],
  );

  const total = data?.total ?? 0;

  return {
    data,
    rows: data?.rows ?? [],
    summary: data?.summary ?? null,
    total,
    loading,
    error,
    reload: load,
    sortBy,
    sortDir,
    toggleSort,
    offset,
    pageSize: PAGE_SIZE,
    hasNextPage: offset + PAGE_SIZE < total,
    hasPrevPage: offset > 0,
    nextPage: () => setOffset((o) => o + PAGE_SIZE),
    prevPage: () => setOffset((o) => Math.max(0, o - PAGE_SIZE)),
  };
}
