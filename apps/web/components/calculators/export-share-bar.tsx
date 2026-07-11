"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

// Zero-dependency CSV export. Blob with a UTF-8 BOM so Excel reads the rupee
// glyph.
export function ExportShareBar({
  buildCsv,
  filename = "calculation.csv",
}: {
  /** Returns the CSV body when the calculator has a schedule to export. */
  buildCsv?: () => string;
  filename?: string;
}) {
  function downloadCsv() {
    const csv = buildCsv?.();
    if (!csv) return;
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  if (!buildCsv) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={downloadCsv}>
        <Download className="h-4 w-4" aria-hidden />
        Download CSV
      </Button>
    </div>
  );
}
