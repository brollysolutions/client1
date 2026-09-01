"use client";

import * as React from "react";

export const LIST_PAGE_SIZE = 25;

/**
 * Client-side slice for a filtered list, with the page reset that every caller
 * was writing by hand.
 *
 * `React.useEffect(() => setPage(0), [filters])` appeared verbatim in at least
 * six views, and forgetting it strands the user on an empty page 3 the moment
 * they narrow a filter. Keying the reset on a caller-supplied `resetKey` keeps
 * that correct without this hook needing to understand any surface's filter
 * shape.
 */
export function useFilteredPage<Row>(
  rows: readonly Row[],
  resetKey: unknown,
  pageSize: number = LIST_PAGE_SIZE,
): {
  page: number;
  setPage: (page: number) => void;
  pageRows: Row[];
  total: number;
} {
  const [page, setPage] = React.useState(0);

  // Serialized so an inline object/array literal for `resetKey` does not reset
  // the page on every render.
  const resetSignature = React.useMemo(() => JSON.stringify(resetKey ?? null), [resetKey]);
  React.useEffect(() => {
    setPage(0);
  }, [resetSignature]);

  // A filter change can also shrink the list below the current page while the
  // signature stays put (a background reload, say) — clamp rather than showing
  // an empty table.
  const lastPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1);
  const safePage = Math.min(page, lastPage);

  const pageRows = React.useMemo(
    () => rows.slice(safePage * pageSize, (safePage + 1) * pageSize),
    [rows, safePage, pageSize],
  );

  return { page: safePage, setPage, pageRows, total: rows.length };
}
