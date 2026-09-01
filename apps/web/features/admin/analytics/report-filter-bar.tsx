"use client";

import * as React from "react";
import { ChevronDownIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EMPTY_FILTERS,
  FilterBar,
  type FilterBarValue,
} from "@/features/dashboard/filter-bar";
import { resolveDatePreset, type DatePreset } from "@/lib/reports";
import type { ReportBucket, ReportBusinessLine, ReportKind } from "@/lib/reports-api";
import { cn } from "@/lib/utils";
import { useAgentOptions } from "./use-agent-options";

const PRESETS: { value: DatePreset; label: string }[] = [
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "last_30_days", label: "Last 30 days" },
];

const BUCKET_OPTIONS: { value: ReportBucket; label: string }[] = [
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
];

export type ReportFilterValue = {
  dateFrom: string;
  dateTo: string;
  bucket: ReportBucket;
  businessLine: ReportBusinessLine | undefined;
  agentProfileUuids: string[];
};

function baselineFilters(): ReportFilterValue {
  const { dateFrom, dateTo } = resolveDatePreset("this_month", new Date());
  return {
    dateFrom,
    dateTo,
    bucket: "week",
    businessLine: undefined,
    agentProfileUuids: [],
  };
}

// The report keeps its domain-specific bucket and multi-Agent controls, but
// date/line/reset layout now comes from the same FilterBar as every staff list.
export function ReportFilterBar({
  kind,
  value,
  onChange,
}: {
  kind: ReportKind;
  value: ReportFilterValue;
  onChange: (next: ReportFilterValue) => void;
}) {
  const [agentQuery, setAgentQuery] = React.useState("");
  const [agentPopoverOpen, setAgentPopoverOpen] = React.useState(false);
  const { options: agentOptions, loading: agentsLoading } = useAgentOptions(value.businessLine);
  const baseline = baselineFilters();
  const filters: FilterBarValue = {
    ...EMPTY_FILTERS,
    line: value.businessLine ?? "all",
    from: value.dateFrom,
    to: value.dateTo,
  };
  const filtersCustomized =
    value.dateFrom !== baseline.dateFrom ||
    value.dateTo !== baseline.dateTo ||
    value.bucket !== baseline.bucket ||
    value.businessLine !== baseline.businessLine ||
    value.agentProfileUuids.length > 0;

  function updateSharedFilters(next: FilterBarValue) {
    onChange({
      ...value,
      dateFrom: next.from,
      dateTo: next.to,
      businessLine: next.line === "all" ? undefined : (next.line as ReportBusinessLine),
    });
  }

  function applyPreset(preset: DatePreset) {
    const { dateFrom, dateTo } = resolveDatePreset(preset, new Date());
    onChange({ ...value, dateFrom, dateTo });
  }

  function toggleAgent(id: string) {
    const agentProfileUuids = value.agentProfileUuids.includes(id)
      ? value.agentProfileUuids.filter((agentId) => agentId !== id)
      : [...value.agentProfileUuids, id];
    onChange({ ...value, agentProfileUuids });
  }

  const filteredAgentOptions = agentOptions.filter((option) =>
    option.label.toLowerCase().includes(agentQuery.trim().toLowerCase()),
  );

  return (
    <FilterBar
      value={filters}
      onChange={updateSharedFilters}
      onClear={() => onChange(baseline)}
      searchLabel="Search report"
      showSearch={false}
      showStatus={false}
      showClear={filtersCustomized}
      dateFromLabel="Report from date"
      dateToLabel="Report to date"
      actions={PRESETS.map((preset) => (
        <Button
          key={preset.value}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => applyPreset(preset.value)}
        >
          {preset.label}
        </Button>
      ))}
      extra={
        <>
          {kind !== "agents" ? (
            <Select
              value={value.bucket}
              onValueChange={(bucket) => onChange({ ...value, bucket: bucket as ReportBucket })}
            >
              <SelectTrigger aria-label="Report grouping">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUCKET_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <Popover open={agentPopoverOpen} onOpenChange={setAgentPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Filter by agents"
                className={cn(
                  "flex h-9 min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  value.agentProfileUuids.length === 0 && "text-muted-foreground",
                )}
              >
                <span className="truncate">
                  {value.agentProfileUuids.length === 0
                    ? "All agents"
                    : `${value.agentProfileUuids.length} selected`}
                </span>
                <ChevronDownIcon className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[280px] p-2">
              <Input
                aria-label="Search agents"
                placeholder="Search agents"
                value={agentQuery}
                maxLength={100}
                onChange={(event) => setAgentQuery(event.target.value)}
                className="mb-2"
              />
              {value.agentProfileUuids.length > 0 ? (
                <button
                  type="button"
                  onClick={() => onChange({ ...value, agentProfileUuids: [] })}
                  className="mb-1 w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-brand-cta hover:bg-muted"
                >
                  Clear selected agents
                </button>
              ) : null}
              <div className="max-h-56 overflow-y-auto">
                {agentsLoading ? (
                  <p className="p-2 text-xs text-text-secondary">Loading agents…</p>
                ) : filteredAgentOptions.length === 0 ? (
                  <p className="p-2 text-xs text-text-secondary">No agents found.</p>
                ) : (
                  filteredAgentOptions.map((option) => (
                    <label
                      key={option.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                    >
                      <Checkbox
                        checked={value.agentProfileUuids.includes(option.id)}
                        onCheckedChange={() => toggleAgent(option.id)}
                      />
                      <span className="truncate">{option.label}</span>
                    </label>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        </>
      }
    />
  );
}
