"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatINR } from "@/lib/format";
import type { Schedule } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { INFO } from "@/lib/calculators/glossary";
import { InfoHint } from "./info-hint";

// Amortization schedule, financial-year view by default (always fits) with a
// month-by-month view a tab away. The monthly table scrolls horizontally on
// small screens rather than breaking the page width.
export function AmortizationTable({ schedule }: { schedule: Schedule }) {
  return (
    <Tabs defaultValue="yearly" className="w-full">
      <TabsList>
        <TabsTrigger value="yearly">By year</TabsTrigger>
        <TabsTrigger value="monthly">Month by month</TabsTrigger>
      </TabsList>

      <TabsContent value="yearly">
        <div className="overflow-x-auto rounded-lg border border-[var(--nav-border)]">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-[var(--nav-bg)] text-left text-text-secondary">
              <tr>
                <Th info={INFO.fyYear}>Financial year</Th>
                <Th align="right" info={INFO.principalPortion}>Principal paid</Th>
                <Th align="right" info={INFO.interestPortion}>Interest paid</Th>
                <Th align="right" info={INFO.balanceRemaining}>Balance</Th>
              </tr>
            </thead>
            <tbody>
              {schedule.fyRows.map((row) => (
                <tr key={row.fyLabel} className="border-t border-[var(--nav-border)]">
                  <Td>{row.fyLabel}</Td>
                  <Td align="right">{formatINR(row.principalPaid)}</Td>
                  <Td align="right">{formatINR(row.interestPaid)}</Td>
                  <Td align="right">{formatINR(row.closingBalance)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TabsContent>

      <TabsContent value="monthly">
        <div className="max-h-[28rem] overflow-auto rounded-lg border border-[var(--nav-border)]">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="sticky top-0 bg-[var(--nav-bg)] text-left text-text-secondary">
              <tr>
                <Th>#</Th>
                <Th align="right" info={INFO.emi}>EMI</Th>
                <Th align="right" info={INFO.principalPortion}>Principal</Th>
                <Th align="right" info={INFO.interestPortion}>Interest</Th>
                <Th align="right" info={INFO.balanceRemaining}>Balance</Th>
              </tr>
            </thead>
            <tbody>
              {schedule.rows.map((row) => (
                <tr key={row.index} className="border-t border-[var(--nav-border)]">
                  <Td>{row.index}</Td>
                  <Td align="right">{formatINR(row.emi)}</Td>
                  <Td align="right">{formatINR(row.principal)}</Td>
                  <Td align="right">{formatINR(row.interest)}</Td>
                  <Td align="right">{formatINR(row.closingBalance)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TabsContent>
    </Tabs>
  );
}

function Th({
  children,
  align,
  info,
}: {
  children: React.ReactNode;
  align?: "right";
  info?: string;
}) {
  return (
    <th className={`px-3 py-2 font-medium ${align === "right" ? "text-right" : ""}`}>
      <span
        className={cn(
          "inline-flex items-center gap-1.5",
          align === "right" && "justify-end",
        )}
      >
        {children}
        {info ? (
          <InfoHint label={typeof children === "string" ? children : "this column"} text={info} />
        ) : null}
      </span>
    </th>
  );
}

function Td({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <td className={`px-3 py-2 text-[var(--nav-text)] ${align === "right" ? "text-right tabular-nums" : ""}`}>
      {children}
    </td>
  );
}
