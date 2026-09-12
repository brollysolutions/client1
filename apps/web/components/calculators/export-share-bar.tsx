"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BRAND_ASSETS, brandedFilename } from "@/lib/brand";
import { calculatorCsv, type CalculatorExport } from "@/lib/calculators/export";

import { Button } from "@/components/ui/button";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = brandedFilename(filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Leave the URL alive until the browser has consumed the download click.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportShareBar({
  buildExport,
  filename = "calculation.csv",
}: {
  buildExport?: () => CalculatorExport;
  filename?: string;
}) {
  const [exporting, setExporting] = useState(false);
  function downloadCsv() {
    const data = buildExport?.();
    const csv = data && calculatorCsv(data);
    if (!csv) return;
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    download(blob, filename);
  }

  async function downloadExcel() {
    if (!buildExport || exporting) return;
    setExporting(true);
    try {
      const data = buildExport();
      const [{ calculatorWorkbook }, response] = await Promise.all([
        import("@/lib/calculators/excel"), fetch(BRAND_ASSETS.horizontal.src),
      ]);
      if (!response.ok) throw new Error("Logo could not be loaded.");
      const buffer = await calculatorWorkbook(data, await response.arrayBuffer());
      download(new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename.replace(/\.csv$/i, ".xlsx"));
    } catch {
      toast.error("Couldn't create the Excel file", { description: "Please try again, or download CSV." });
    } finally {
      setExporting(false);
    }
  }

  if (!buildExport) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={downloadCsv}>
        <Download className="h-4 w-4" aria-hidden />
        Download CSV
      </Button>
      <Button variant="outline" size="sm" onClick={() => void downloadExcel()} disabled={exporting} aria-busy={exporting}>
        <Download className="h-4 w-4" aria-hidden />
        {exporting ? "Preparing Excel…" : "Download Excel"}
      </Button>
    </div>
  );
}
