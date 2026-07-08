"use client";

import { Download, Link2, Printer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

// Zero-dependency export + share. CSV is a Blob with a UTF-8 BOM so Excel reads
// the rupee glyph; PDF is the browser's own print of a print-only view (see the
// @media print rules in globals.css); share is just the current URL, since the
// calculator state lives in the querystring.
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

  function copyLink() {
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => toast.success("Link copied. Share your calculation."))
      .catch(() => toast.error("Could not copy the link."));
  }

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      {buildCsv ? (
        <Button variant="outline" size="sm" onClick={downloadCsv}>
          <Download className="h-4 w-4" aria-hidden />
          Download CSV
        </Button>
      ) : null}
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <Printer className="h-4 w-4" aria-hidden />
        Print / PDF
      </Button>
      <Button variant="outline" size="sm" onClick={copyLink}>
        <Link2 className="h-4 w-4" aria-hidden />
        Copy link
      </Button>
    </div>
  );
}
