import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { brandedFilename } from "@/lib/brand";
import { calculatorCsv, type CalculatorExport } from "./export";
import { calculatorWorkbook } from "./excel";

const data: CalculatorExport = { title: "EMI schedule", columns: ["Month", "EMI", "Principal", "Interest", "Balance"], rows: [[1, 105.5, 100, 5.5, 900], [2, 105.5, 101, 4.5, 799]] };
const logo = readFileSync("public/brand/logo-horizontal.png");
const logoBytes = new Uint8Array(logo).buffer;

describe("calculator exports", () => {
  it("retains the CSV schema and numbers with no presentation rows", () => {
    expect(calculatorCsv(data)).toBe("Month,EMI,Principal,Interest,Balance\n1,105.5,100,5.5,900\n2,105.5,101,4.5,799");
    expect(brandedFilename("emi.csv")).toBe("dhanadhara-emi.csv");
    expect(brandedFilename("dhanadhara-emi.csv")).toBe("dhanadhara-emi.csv");
  });

  it.each([data, { ...data, rows: [] }])("embeds the logo and round-trips numeric rows", async (input) => {
    const bytes = await calculatorWorkbook(input, logoBytes);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);
    const sheet = workbook.getWorksheet("Calculation")!;
    expect(workbook.creator).toBe("Dhanadhara");
    expect(sheet.getRow(7).values).toEqual([undefined, ...data.columns]);
    for (const [index, row] of input.rows.entries()) {
      expect(sheet.getRow(index + 8).values).toEqual([undefined, ...row]);
    }
    expect(sheet.getImages()).toHaveLength(1);
    expect(Buffer.from(workbook.getImage(0).buffer!)).toEqual(logo);
  });

  it("rejects non-finite and malformed rows", async () => {
    await expect(calculatorWorkbook({ ...data, rows: [[1, Infinity]] }, logoBytes)).rejects.toThrow("invalid values");
  });
});
