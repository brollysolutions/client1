import type { RentVsBuyResult, Schedule } from "@/lib/finance";

export type CalculatorExport = {
  title: string;
  columns: string[];
  rows: number[][];
};

export function scheduleExport(schedule: Schedule, title: string): CalculatorExport {
  return {
    title,
    columns: ["Month", "EMI", "Principal", "Interest", "Balance"],
    rows: schedule.rows.map((r) => [r.index, r.emi, r.principal, r.interest, r.closingBalance]),
  };
}

export function rentVsBuyExport(result: RentVsBuyResult): CalculatorExport {
  return {
    title: "Rent vs buy yearly comparison",
    columns: ["Year", "Rent paid", "Owner outgo", "Home equity", "Renter corpus", "Buy advantage"],
    rows: result.years.map((r) => [r.year, r.rentPaid, r.ownerOutgo, r.homeEquity, r.renterCorpus, r.buyAdvantage]),
  };
}

export function calculatorCsv(data: CalculatorExport): string {
  return [data.columns.join(","), ...data.rows.map((row) => row.join(","))].join("\n");
}
