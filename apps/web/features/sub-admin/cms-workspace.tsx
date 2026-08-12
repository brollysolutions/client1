"use client";

import * as React from "react";
import { Monitor, Smartphone, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export const CMS_WORKSPACE_DIALOG_CLASS =
  "!top-4 !left-4 !grid h-[calc(100dvh-2rem)] !w-[calc(100%-2rem)] !max-w-none !translate-x-0 !translate-y-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl p-5 sm:!max-w-none sm:p-6";

export function CmsWorkspaceHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
      <DialogHeader className="min-w-0 text-left">
        <DialogTitle className="truncate">{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogClose asChild>
        <Button variant="ghost" size="icon" className="shrink-0 hover:bg-blue-50 hover:text-brand-cta">
          <X className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Close workspace</span>
        </Button>
      </DialogClose>
    </div>
  );
}

export function CmsWorkspaceLayout({
  editor,
  preview,
}: {
  editor: React.ReactNode;
  preview?: React.ReactNode;
}) {
  return (
    <div className={cn("min-h-0 overflow-y-auto", preview && "grid gap-5 xl:grid-cols-[minmax(22rem,0.85fr)_minmax(30rem,1.15fr)]")}>
      <div className="min-w-0 py-1">{editor}</div>
      {preview ? <aside className="min-w-0 py-1 xl:sticky xl:top-0 xl:self-start">{preview}</aside> : null}
    </div>
  );
}

export type PreviewDevice = "desktop" | "mobile";

export type CmsFilterValue = {
  search: string;
  status: string;
  line: string;
  kind: string;
  from: string;
  to: string;
};

export function CmsFilterBar({
  value,
  onChange,
  statusOptions,
  kindOptions,
  kindLabel,
  lineOptions = [
    { value: "loans", label: "Loans" },
    { value: "real_estate", label: "Real Estate" },
    { value: "both", label: "Both lines" },
  ],
  searchLabel,
  showStatus = true,
}: {
  value: CmsFilterValue;
  onChange: (value: CmsFilterValue) => void;
  statusOptions: readonly { value: string; label: string }[];
  kindOptions?: readonly { value: string; label: string }[];
  kindLabel?: string;
  lineOptions?: readonly { value: string; label: string }[];
  searchLabel: string;
  showStatus?: boolean;
}) {
  const set = (patch: Partial<CmsFilterValue>) => onChange({ ...value, ...patch });
  return (
    <section className="rounded-xl border border-border bg-card p-3" aria-label="Advanced filters">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Input aria-label={searchLabel} placeholder="Search" value={value.search} onChange={(event) => set({ search: event.target.value })} />
        {showStatus ? <Select value={value.status} onValueChange={(status) => set({ status })}>
          <SelectTrigger aria-label="Filter by status"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All statuses</SelectItem>{statusOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select> : null}
        <Select value={value.line} onValueChange={(line) => set({ line })}>
          <SelectTrigger aria-label="Filter by business line"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All lines</SelectItem>{lineOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
        {kindOptions ? (
          <Select value={value.kind} onValueChange={(kind) => set({ kind })}>
            <SelectTrigger aria-label={kindLabel ?? "Filter by type"}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All {kindLabel?.toLowerCase() ?? "types"}</SelectItem>{kindOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
          </Select>
        ) : null}
        <Input aria-label="From date" type="date" value={value.from} onChange={(event) => set({ from: event.target.value })} />
        <Input aria-label="To date" type="date" min={value.from || undefined} value={value.to} onChange={(event) => set({ to: event.target.value })} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-text-secondary">Filters apply to the records already loaded for your authorized role.</p>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ search: "", status: "all", line: "all", kind: "all", from: "", to: "" })}>Clear filters</Button>
      </div>
    </section>
  );
}

export function CmsPreviewFrame({
  title,
  description,
  contexts,
  context,
  onContextChange,
  device,
  onDeviceChange,
  children,
}: {
  title: string;
  description: string;
  contexts?: readonly { value: string; label: string }[];
  context?: string;
  onContextChange?: (value: string) => void;
  device: PreviewDevice;
  onDeviceChange: (device: PreviewDevice) => void;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-muted/20 p-4" aria-label={`${title} preview`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          <p className="mt-0.5 text-xs leading-5 text-text-secondary">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {contexts && context && onContextChange ? (
            <Tabs value={context} onValueChange={onContextChange}>
              <TabsList aria-label="Preview context">
                {contexts.map((item) => <TabsTrigger key={item.value} value={item.value}>{item.label}</TabsTrigger>)}
              </TabsList>
            </Tabs>
          ) : null}
          <div className="flex rounded-lg border border-border bg-card p-0.5" role="group" aria-label="Preview size">
            <Button type="button" size="icon" variant={device === "desktop" ? "outline" : "ghost"} onClick={() => onDeviceChange("desktop")} aria-label="Desktop preview">
              <Monitor className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button type="button" size="icon" variant={device === "mobile" ? "outline" : "ghost"} onClick={() => onDeviceChange("mobile")} aria-label="Mobile preview">
              <Smartphone className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-white p-3">
        <div className={cn("mx-auto transition-[max-width]", device === "mobile" ? "max-w-[390px]" : "max-w-none")}>
          {children}
        </div>
      </div>
      <p className="text-xs text-text-secondary">
        Preview only. Approval, targeting, schedule, ranking, and page context determine actual visibility.
      </p>
    </section>
  );
}
