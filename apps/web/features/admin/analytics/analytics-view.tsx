"use client";

import * as React from "react";
import {
  BadgeCheck,
  BarChart3,
  Building2,
  Download,
  FileSpreadsheet,
  Landmark,
  Loader2,
  Percent,
  PhoneCall,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DashboardHeader,
  DashboardPage,
  MetricCard,
  MetricGrid,
} from "@/features/dashboard/dashboard-ui";
import { formatConversionRate, resolveDatePreset } from "@/lib/reports";
import {
  downloadReportCsv,
  downloadReportExcel,
  type AgentsReportResponse,
  type AgentsReportRow,
  type AgentsSummary,
  type ReportKind,
  type ReportSummary,
  type TeamPerformanceSummary,
} from "@/lib/reports-api";
import { ReportFilterBar, type ReportFilterValue } from "./report-filter-bar";
import { ReportTable, type ReportColumn } from "./report-table";
import { useReport } from "./use-report";

const REPORT_KINDS: { value: ReportKind; label: string }[] = [
  { value: "leads", label: "Leads" },
  { value: "loans", label: "Loans" },
  { value: "deals", label: "Deals" },
  { value: "agents", label: "Agents" },
];

const LINE_LABEL: Record<string, string> = {
  loans: "Loans",
  real_estate: "Real Estate",
};

type JourneyRow = { bucket_start: string; business_line: string; total: number; converted: number };

function formatBucket(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function journeyColumns(totalLabel: string): ReportColumn<JourneyRow>[] {
  return [
    { key: "bucket_start", header: "Period", sortable: true, render: (r) => formatBucket(r.bucket_start) },
    {
      key: "business_line",
      header: "Line",
      sortable: true,
      render: (r) => LINE_LABEL[r.business_line] ?? r.business_line,
    },
    { key: "total", header: totalLabel, sortable: true, align: "right", render: (r) => String(r.total) },
    { key: "converted", header: "Converted", sortable: true, align: "right", render: (r) => String(r.converted) },
    {
      key: "",
      header: "Conv. rate",
      align: "right",
      render: (r) => formatConversionRate(r.total, r.converted),
    },
  ];
}

const AGENTS_COLUMNS: ReportColumn<AgentsReportRow>[] = [
  { key: "agent_code", header: "Agent", sortable: true, render: (r) => `${r.agent_name} (${r.agent_code})` },
  {
    key: "business_line",
    header: "Line",
    sortable: true,
    render: (r) => LINE_LABEL[r.business_line] ?? r.business_line,
  },
  { key: "leads_total", header: "Leads", sortable: true, align: "right", render: (r) => String(r.leads_total) },
  {
    key: "leads_converted",
    header: "Leads conv.",
    sortable: true,
    align: "right",
    render: (r) => String(r.leads_converted),
  },
  { key: "loans_total", header: "Loans", sortable: true, align: "right", render: (r) => String(r.loans_total) },
  {
    key: "loans_converted",
    header: "Disbursed",
    sortable: true,
    align: "right",
    render: (r) => String(r.loans_converted),
  },
  { key: "deals_total", header: "Deals", sortable: true, align: "right", render: (r) => String(r.deals_total) },
  {
    key: "deals_converted",
    header: "Closed",
    sortable: true,
    align: "right",
    render: (r) => String(r.deals_converted),
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const COLUMN_DEFS: Record<ReportKind, ReportColumn<any>[]> = {
  leads: journeyColumns("Leads"),
  loans: journeyColumns("Applications"),
  deals: journeyColumns("Deals"),
  agents: AGENTS_COLUMNS,
};

const ROW_KEY: Record<ReportKind, (row: JourneyRow | AgentsReportRow) => string> = {
  leads: (r) => `${(r as JourneyRow).bucket_start}-${(r as JourneyRow).business_line}`,
  loans: (r) => `${(r as JourneyRow).bucket_start}-${(r as JourneyRow).business_line}`,
  deals: (r) => `${(r as JourneyRow).bucket_start}-${(r as JourneyRow).business_line}`,
  agents: (r) => (r as AgentsReportRow).agent_profile_uuid,
};

type MetricTile = { label: string; value: string; icon: LucideIcon };

function journeyTiles(summary: ReportSummary | null): MetricTile[] {
  if (!summary) return [];
  return [
    { label: "Total", value: String(summary.total_count), icon: BarChart3 },
    { label: "Converted", value: String(summary.converted_count), icon: BadgeCheck },
    {
      label: "Conversion rate",
      value: formatConversionRate(summary.total_count, summary.converted_count),
      icon: Percent,
    },
  ];
}

function agentsTiles(summary: AgentsSummary | null): MetricTile[] {
  if (!summary) return [];
  return [
    { label: "Agents", value: String(summary.agent_count), icon: Users },
    { label: "Leads", value: String(summary.leads_total), icon: PhoneCall },
    { label: "Loans disbursed", value: String(summary.loans_converted), icon: Landmark },
    { label: "Deals closed", value: String(summary.deals_converted), icon: Building2 },
  ];
}

function TeamPerformance({ teams }: { teams: TeamPerformanceSummary[] }) {
  if (teams.length === 0) return null;
  return (
    <section aria-labelledby="team-performance-heading" className="space-y-3">
      <div>
        <h2 id="team-performance-heading" className="text-base font-semibold text-text-primary">
          Team performance
        </h2>
        <p className="text-xs text-text-secondary">
          Teams are the established business lines. These totals use the selected Agent group.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {teams.map((team) => (
          <div key={team.business_line} className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-medium text-text-primary">
              {LINE_LABEL[team.business_line] ?? team.business_line} team
            </h3>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <dt className="text-text-secondary">Agents</dt>
                <dd className="font-medium text-text-primary">{team.agent_count}</dd>
              </div>
              <div>
                <dt className="text-text-secondary">Lead conversion</dt>
                <dd className="font-medium text-text-primary">
                  {formatConversionRate(team.leads_total, team.leads_converted)}
                </dd>
              </div>
              <div>
                <dt className="text-text-secondary">Leads</dt>
                <dd className="font-medium text-text-primary">
                  {team.leads_total} total · {team.leads_converted} converted
                </dd>
              </div>
              <div>
                <dt className="text-text-secondary">Loans</dt>
                <dd className="font-medium text-text-primary">
                  {team.loans_total} total · {team.loans_converted} disbursed
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-text-secondary">Deals</dt>
                <dd className="font-medium text-text-primary">
                  {team.deals_total} total · {team.deals_converted} closed
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

function defaultFilters(): ReportFilterValue {
  const { dateFrom, dateTo } = resolveDatePreset("this_month", new Date());
  return { dateFrom, dateTo, bucket: "week", businessLine: undefined, agentProfileUuids: [] };
}

function ReportPanel({ kind }: { kind: ReportKind }) {
  const [filters, setFilters] = React.useState<ReportFilterValue>(defaultFilters);
  const {
    data,
    rows,
    summary,
    total,
    loading,
    error,
    reload,
    sortBy,
    sortDir,
    toggleSort,
    offset,
    hasNextPage,
    hasPrevPage,
    nextPage,
    prevPage,
  } = useReport(kind, filters);
  const [exporting, setExporting] = React.useState(false);

  async function onExport(format: "csv" | "xlsx") {
    setExporting(true);
    const filtersForExport = {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      bucket: filters.bucket,
      businessLine: filters.businessLine,
      agentProfileUuids: filters.agentProfileUuids,
    };
    const res =
      format === "csv"
        ? await downloadReportCsv(kind, filtersForExport)
        : await downloadReportExcel(kind, filtersForExport);
    setExporting(false);
    if (!res.ok) {
      toast.error("Couldn't export the report", { description: res.error });
    } else if (res.truncated) {
      toast.warning("Export limited to 50,000 rows", {
        description: "Narrow the date range or filters to export the remaining data.",
      });
    }
  }

  const columns = COLUMN_DEFS[kind];
  const rowKey = ROW_KEY[kind];
  const tiles = kind === "agents" ? agentsTiles(summary as AgentsSummary | null) : journeyTiles(summary as ReportSummary | null);
  const teamSummaries =
    kind === "agents" ? (data as AgentsReportResponse | null)?.team_summaries ?? [] : [];

  return (
    <div className="space-y-4">
      <ReportFilterBar kind={kind} value={filters} onChange={setFilters} />

      {loading && tiles.length === 0 ? (
        <MetricGrid>
          {Array.from({ length: kind === "agents" ? 4 : 3 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </MetricGrid>
      ) : (
        <MetricGrid>
          {tiles.map((tile) => (
            <MetricCard key={tile.label} {...tile} />
          ))}
        </MetricGrid>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => void onExport("csv")} disabled={exporting || loading}>
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="h-4 w-4" aria-hidden="true" />
          )}
          Export CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => void onExport("xlsx")} disabled={exporting || loading}>
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
          )}
          Export Excel
        </Button>
      </div>

      <ReportTable
        rows={rows}
        columns={columns}
        rowKey={rowKey}
        sortBy={sortBy}
        sortDir={sortDir}
        onSort={toggleSort}
        loading={loading}
        error={error}
        onRetry={() => void reload()}
        emptyMessage="No activity in this date range."
      />

      {!loading && !error && rows.length > 0 ? (
        <div className="flex items-center justify-between">
          <p className="text-xs text-text-secondary">
            Showing {offset + 1}-{offset + rows.length} of {total}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={prevPage} disabled={!hasPrevPage}>
              Previous
            </Button>
            <Button variant="outline" size="sm" onClick={nextPage} disabled={!hasNextPage}>
              Next
            </Button>
          </div>
        </div>
      ) : null}

      {kind === "agents" ? <TeamPerformance teams={teamSummaries} /> : null}
    </div>
  );
}

// FR-16.1-16.3: weekly/monthly views, date/line/agent filtering, per-report
// sorting, and CSV export, across leads/loans/deals/agents. One Tabs shell
// so each report keeps its own filter + sort + pagination state
// independently (matching loan-config-view.tsx's per-tab-hook convention).
export function AnalyticsView() {
  return (
    <DashboardPage>
      <DashboardHeader
        title="Analytics & reports"
        description="Lead, loan, and deal activity across both business lines, with per-agent performance."
      />

      <Tabs defaultValue="leads">
        <TabsList className="h-auto w-full justify-start overflow-x-auto">
          {REPORT_KINDS.map((k) => (
            <TabsTrigger key={k.value} value={k.value}>
              {k.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {REPORT_KINDS.map((k) => (
          <TabsContent key={k.value} value={k.value} className="mt-4">
            <ReportPanel kind={k.value} />
          </TabsContent>
        ))}
      </Tabs>
    </DashboardPage>
  );
}
