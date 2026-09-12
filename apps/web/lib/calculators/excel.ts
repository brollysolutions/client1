import ExcelJS from "exceljs";
import type { CalculatorExport } from "./export";

// Imported only after the user asks for Excel. This writes local computed rows;
// it never reads untrusted workbook files or sends calculator data to a server.
export async function calculatorWorkbook(data: CalculatorExport, logo: ArrayBuffer) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Dhanadhara";
  workbook.title = data.title;
  const sheet = workbook.addWorksheet("Calculation", {
    views: [{ state: "frozen", ySplit: 7 }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:7" },
  });
  const image = workbook.addImage({ buffer: logo as ExcelJS.Buffer, extension: "png" });
  sheet.addImage(image, { tl: { col: 0, row: 0 }, ext: { width: 240, height: 44 } });
  sheet.getCell("A4").value = data.title;
  sheet.getCell("A4").font = { bold: true, size: 14, color: { argb: "FF172878" } };
  sheet.getCell("A5").value = "Illustrative calculation. Actual terms may vary.";
  sheet.getRow(7).values = data.columns;
  sheet.getRow(7).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF172878" } };
  data.columns.forEach((_, index) => {
    sheet.getColumn(index + 1).width = index === 0 ? 12 : 22;
  });
  for (const values of data.rows) {
    if (values.length !== data.columns.length || values.some((v) => !Number.isFinite(v))) {
      throw new Error("The calculation contains invalid values.");
    }
    const row = sheet.addRow(values);
    row.eachCell((cell, column) => { cell.numFmt = column === 1 ? "0" : "#,##0.00"; });
  }
  sheet.autoFilter = { from: { row: 7, column: 1 }, to: { row: 7 + data.rows.length, column: data.columns.length } };
  return workbook.xlsx.writeBuffer();
}
