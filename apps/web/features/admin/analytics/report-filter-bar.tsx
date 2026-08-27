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
import { cn } from "@/lib/utils";
import { resolveDatePreset, type DatePreset } from "@/lib/reports";
import type { ReportBucket, ReportBusinessLine, ReportKind } from "@/lib/reports-api";
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

// FR-16.1's date-based filtering: native <input type="date"> pair + preset
// buttons rather than a shadcn calendar.tsx (that pulls in react-day-picker,
// and no date picker exists anywhere in this app today -- the spec asks for
// date filtering, not a specific picker widget).
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

  const businessLineOptions = [
    { value: "loans", label: "Loans" },
    { value: "real_estate", label: "Real Estate" },
  ];

  function applyPreset(preset: DatePreset) {
    const { dateFrom, dateTo } = resolveDatePreset(preset, new Date());
    onChange({ ...value, dateFrom, dateTo });
  }

  function toggleAgent(id: string) {
    const next = value.agentProfileUuids.includes(id)
      ? value.agentProfileUuids.filter((a) => a !== id)
      : [...value.agentProfileUuids, id];
    onChange({ ...value, agentProfileUuids: next });
  }

  const filteredAgentOptions = agentOptions.filter((o) =>
    o.label.toLowerCase().includes(agentQuery.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button key={p.value} variant="outline" size="sm" onClick={() => applyPreset(p.value)}>
            {p.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="report-date-from" className="text-xs font-medium text-text-secondary">
            From
          </label>
          <Input
            id="report-date-from"
            type="date"
            value={value.dateFrom}
            max={value.dateTo}
            onChange={(e) => onChange({ ...value, dateFrom: e.target.value })}
            className="w-[160px]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="report-date-to" className="text-xs font-medium text-text-secondary">
            To
          </label>
          <Input
            id="report-date-to"
            type="date"
            value={value.dateTo}
            min={value.dateFrom}
            onChange={(e) => onChange({ ...value, dateTo: e.target.value })}
            className="w-[160px]"
          />
        </div>

        {kind !== "agents" ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">View</span>
            <Select
              value={value.bucket}
              onValueChange={(v) => onChange({ ...value, bucket: v as ReportBucket })}
            >
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUCKET_OPTIONS.map((b) => (
                  <SelectItem key={b.value} value={b.value}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-text-secondary">Business line</span>
          <Select
            value={value.businessLine ?? "__all"}
            onValueChange={(v) =>
              onChange({
                ...value,
                businessLine: v === "__all" ? undefined : (v as ReportBusinessLine),
              })
            }
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All lines" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All lines</SelectItem>
              {businessLineOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-text-secondary">Agents</span>
          <Popover open={agentPopoverOpen} onOpenChange={setAgentPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex h-9 w-[200px] items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  value.agentProfileUuids.length === 0 && "text-muted-foreground",
                )}
              >
                <span className="truncate">
                  {value.agentProfileUuids.length === 0
                    ? "All agents"
                    : `${value.agentProfileUuids.length} selected`}
                </span>
                <ChevronDownIcon className="h-4 w-4 shrink-0 opacity-50" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[260px] p-2">
              <Input
                placeholder="Search agents"
                value={agentQuery}
                maxLength={100}
                onChange={(e) => setAgentQuery(e.target.value)}
                className="mb-2"
              />
              {value.agentProfileUuids.length > 0 ? (
                <button
                  type="button"
                  className="mb-2 text-xs font-medium text-brand-cta hover:underline"
                  onClick={() => onChange({ ...value, agentProfileUuids: [] })}
                >
                  Clear selection
                </button>
              ) : null}
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {agentsLoading ? (
                  <p className="p-2 text-xs text-text-secondary">Loading agents…</p>
                ) : filteredAgentOptions.length === 0 ? (
                  <p className="p-2 text-xs text-text-secondary">No agents found.</p>
                ) : (
                  filteredAgentOptions.map((o) => (
                    <label
                      key={o.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                    >
                      <Checkbox
                        checked={value.agentProfileUuids.includes(o.id)}
                        onCheckedChange={() => toggleAgent(o.id)}
                      />
                      <span className="truncate">{o.label}</span>
                    </label>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}
