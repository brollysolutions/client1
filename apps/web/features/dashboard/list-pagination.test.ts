import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  clampPaginationPage,
  ListPagination,
  paginateItems,
  paginationPageCount,
} from "./list-pagination";

describe("dashboard list pagination", () => {
  it("returns a stable 25-row page without mutating the source", () => {
    const items = Array.from({ length: 60 }, (_, index) => index + 1);

    expect(paginateItems(items, 1)).toEqual(Array.from({ length: 25 }, (_, index) => index + 26));
    expect(items).toHaveLength(60);
    expect(paginationPageCount(items.length)).toBe(3);
  });

  it("clamps stale pages after filtering or deletion", () => {
    expect(clampPaginationPage(4, 26)).toBe(1);
    expect(paginateItems(["a", "b"], 9)).toEqual(["a", "b"]);
  });

  it("handles empty collections and invalid page sizes safely", () => {
    expect(paginationPageCount(0)).toBe(1);
    expect(clampPaginationPage(-2, 50)).toBe(0);
    expect(paginateItems([1, 2], 0, 0)).toEqual([1]);
  });

  it("preserves the result count while showing controls only for multiple pages", () => {
    const singlePage = renderToStaticMarkup(
      React.createElement(ListPagination, { page: 0, total: 12, onPageChange: () => undefined }),
    );
    const multiplePages = renderToStaticMarkup(
      React.createElement(ListPagination, { page: 1, total: 60, onPageChange: () => undefined }),
    );

    expect(singlePage).toContain("Showing 1-12 of 12");
    expect(singlePage).not.toContain("Previous");
    expect(multiplePages).toContain("Showing 26-50 of 60 · Page 2 of 3");
    expect(multiplePages).toContain("Previous");
    expect(multiplePages).toContain("Next");
  });
});
