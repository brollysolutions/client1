"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * The filter bar for every staff list.
 *
 * Grown out of `features/sub-admin`'s `CmsFilterBar`, which was the most
 * complete of the five near-identical copies in the codebase (the others were
 * inline `grid … lg:grid-cols-4` blocks in the agent, vehicle-arrangement, loan
 * and property-deal queues). Everything the CMS version did is preserved;
 * what is new is that each control can be switched off independently and a
 * surface can drop its own controls in through `extra`, which is what let the
 * admin queues stop hand-rolling their own bars.
 *
 * Every filtered surface uses `"all"` as the not-filtering sentinel rather than
 * an empty string, because Radix `Select` treats `""` as "no value" and would
 * render the placeholder instead of the "All …" option.
 */
export type FilterBarValue = {
  search: string;
  status: string;
  line: string;
  kind: string;
  from: string;
  to: string;
};

export type FilterOption = { value: string; label: string };

export const EMPTY_FILTERS: FilterBarValue = {
  search: "",
  status: "all",
  line: "all",
  kind: "all",
  from: "",
  to: "",
};

export const DEFAULT_LINE_OPTIONS: readonly FilterOption[] = [
  { value: "loans", label: "Loans" },
  { value: "real_estate", label: "Real Estate" },
  { value: "both", label: "Both lines" },
];

export function filtersAreActive(value: FilterBarValue): boolean {
  return (
    value.search !== "" ||
    value.status !== "all" ||
    value.line !== "all" ||
    value.kind !== "all" ||
    value.from !== "" ||
    value.to !== ""
  );
}

/** `YYYY-MM-DD` bounds, both optional. Mirrors `lib/date-range.isInDateRange`. */
export function matchesSearch(haystack: string, search: string): boolean {
  return haystack.toLowerCase().includes(search.trim().toLowerCase());
}

export function FilterBar({
  value,
  onChange,
  searchLabel,
  searchPlaceholder = "Search",
  statusOptions,
  statusLabel = "statuses",
  kindOptions,
  kindLabel,
  lineOptions = DEFAULT_LINE_OPTIONS,
  showSearch = true,
  showStatus = true,
  showLine = true,
  showDates = true,
  showClear = true,
  dateFromLabel = "From date",
  dateToLabel = "To date",
  note,
  actions,
  extra,
  onClear,
  className,
}: {
  value: FilterBarValue;
  onChange: (value: FilterBarValue) => void;
  searchLabel: string;
  searchPlaceholder?: string;
  statusOptions?: readonly FilterOption[];
  statusLabel?: string;
  kindOptions?: readonly FilterOption[];
  kindLabel?: string;
  lineOptions?: readonly FilterOption[];
  showSearch?: boolean;
  showStatus?: boolean;
  showLine?: boolean;
  showDates?: boolean;
  showClear?: boolean;
  dateFromLabel?: string;
  dateToLabel?: string;
  note?: string;
  /** Compact presets or scope controls rendered above the filter grid. */
  actions?: ReactNode;
  /** Surface-specific controls, rendered in the same grid as the built-ins. */
  extra?: ReactNode;
  /** Override the default all-empty reset when a surface has a meaningful baseline. */
  onClear?: () => void;
  className?: string;
}) {
  const set = (patch: Partial<FilterBarValue>) => onChange({ ...value, ...patch });
  const active = filtersAreActive(value);

  return (
    <section
      className={cn("rounded-xl border border-border bg-card p-3", className)}
      aria-label="Filters"
    >
      {actions ? <div className="mb-3 flex flex-wrap gap-2">{actions}</div> : null}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {showSearch ? (
          <Input
            aria-label={searchLabel}
            placeholder={searchPlaceholder}
            value={value.search}
            maxLength={100}
            onChange={(event) => set({ search: event.target.value })}
          />
        ) : null}

        {showStatus && statusOptions ? (
          <Select value={value.status} onValueChange={(status) => set({ status })}>
            <SelectTrigger aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All {statusLabel}</SelectItem>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {showLine ? (
          <Select value={value.line} onValueChange={(line) => set({ line })}>
            <SelectTrigger aria-label="Filter by business line">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All lines</SelectItem>
              {lineOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {kindOptions ? (
          <Select value={value.kind} onValueChange={(kind) => set({ kind })}>
            <SelectTrigger aria-label={kindLabel ?? "Filter by type"}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All {kindLabel?.toLowerCase() ?? "types"}</SelectItem>
              {kindOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {extra}

        {showDates ? (
          <>
            <Input
              aria-label={dateFromLabel}
              type="date"
              value={value.from}
              onChange={(event) => set({ from: event.target.value })}
            />
            <Input
              aria-label={dateToLabel}
              type="date"
              min={value.from || undefined}
              value={value.to}
              onChange={(event) => set({ to: event.target.value })}
            />
          </>
        ) : null}
      </div>

      {note || (active && showClear) ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-text-secondary">{note}</p>
          {active && showClear ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => (onClear ? onClear() : onChange(EMPTY_FILTERS))}
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
