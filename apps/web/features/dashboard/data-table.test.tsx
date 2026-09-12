import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DataTable, nextSort } from "./data-table";

describe("responsive records", () => {
  it("keeps sort controls accessible when the desktop header is hidden", () => {
    const markup = renderToStaticMarkup(
      <DataTable
        columns={[
          { key: "name", header: "Name", sortable: true, render: (row: { id: string }) => row.id },
          { key: "status", header: "Status", render: () => "Pending" },
        ]}
        rows={[{ id: "A long record title" }]}
        rowKey={(row) => row.id}
        sort={nextSort({ key: "name", dir: "asc" }, "name")}
        onSortChange={() => undefined}
      />,
    );
    expect(markup).toContain('aria-label="Sort records"');
    expect(markup).toContain('aria-label="Sort by Name, descending"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).not.toContain('aria-label="Sort by Status');
    expect(markup).toContain('data-label="Status"');
    expect(markup).toContain("A long record title");
  });

  it("does not expose a nonfunctional sort control for read-only data", () => {
    const markup = renderToStaticMarkup(
      <DataTable columns={[{ key: "name", header: "Name", render: (row: string) => row }]} rows={["A record"]} rowKey={(row) => row} />,
    );
    expect(markup).not.toContain('aria-label="Sort records"');
  });
});
