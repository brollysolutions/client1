"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";

export const DASHBOARD_PAGE_SIZE = 25;

export function paginationPageCount(total: number, pageSize = DASHBOARD_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)));
}

export function clampPaginationPage(
  page: number,
  total: number,
  pageSize = DASHBOARD_PAGE_SIZE,
): number {
  return Math.min(Math.max(0, page), paginationPageCount(total, pageSize) - 1);
}

export function paginateItems<T>(
  items: readonly T[],
  page: number,
  pageSize = DASHBOARD_PAGE_SIZE,
): T[] {
  const safePageSize = Math.max(1, pageSize);
  const safePage = clampPaginationPage(page, items.length, safePageSize);
  return items.slice(safePage * safePageSize, (safePage + 1) * safePageSize);
}

export function useListPagination<T>(items: readonly T[], pageSize = DASHBOARD_PAGE_SIZE) {
  const [requestedPage, setPage] = React.useState(0);
  const page = clampPaginationPage(requestedPage, items.length, pageSize);

  React.useEffect(() => {
    if (requestedPage !== page) setPage(page);
  }, [page, requestedPage]);

  return {
    page,
    pageItems: React.useMemo(() => paginateItems(items, page, pageSize), [items, page, pageSize]),
    setPage,
  };
}

export function ListPagination({
  page,
  total,
  onPageChange,
  pageSize = DASHBOARD_PAGE_SIZE,
  label = "List pages",
}: {
  page: number;
  total: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  label?: string;
}) {
  const safePageSize = Math.max(1, pageSize);
  const safePage = clampPaginationPage(page, total, safePageSize);
  const pageCount = paginationPageCount(total, safePageSize);
  const start = total === 0 ? 0 : safePage * safePageSize + 1;
  const end = Math.min((safePage + 1) * safePageSize, total);

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 pt-1" aria-label={label}>
      <p className="text-xs tabular-nums text-text-secondary" aria-live="polite">
        Showing {start}-{end} of {total}
        {pageCount > 1 ? ` · Page ${safePage + 1} of ${pageCount}` : ""}
      </p>
      {pageCount > 1 ? (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={safePage === 0}
            onClick={() => onPageChange(safePage - 1)}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={safePage >= pageCount - 1}
            onClick={() => onPageChange(safePage + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </nav>
  );
}
