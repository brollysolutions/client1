"use client";

import * as React from "react";
import { Maximize2, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CLOSE_BUTTON_CLASS } from "@/components/ui/close-button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AdminPendingItem } from "@/lib/admin-api";
import { PANEL_DIALOG_FILTERED_CLASS } from "@/features/dashboard/workspace-dialog";
import { cn } from "@/lib/utils";

import { filterPendingReview, type PendingReviewFilters } from "./admin-home-pending-review";
import { PendingReviewList, REVIEW_KIND_LABEL, REVIEW_LINE_LABEL } from "./pending-review-list";

const EMPTY_FILTERS: PendingReviewFilters = {
  search: "",
  kind: "all",
  businessLine: "all",
  submittedFrom: "",
  submittedTo: "",
};

export function PendingReviewDialog({
  items,
  total,
}: {
  items: AdminPendingItem[];
  total: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [filters, setFilters] = React.useState<PendingReviewFilters>(EMPTY_FILTERS);
  const filteredItems = React.useMemo(() => filterPendingReview(items, filters), [filters, items]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Maximize2 className="h-4 w-4" aria-hidden="true" />
        Review filters
      </Button>
      <DialogContent
        showCloseButton={false}
        className={PANEL_DIALOG_FILTERED_CLASS}
      >
        <DialogHeader className="pr-12">
          <DialogTitle>Waiting on you</DialogTitle>
          <DialogDescription>
            Filter the {items.length} newest loaded review items. {total > items.length ? `The dashboard preview contains the newest ${items.length} of ${total} pending items.` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Input
            aria-label="Search review items"
            placeholder="Search title"
            value={filters.search}
            maxLength={100}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
          />
          <Select value={filters.kind ?? "all"} onValueChange={(kind) => setFilters((current) => ({ ...current, kind: kind as PendingReviewFilters["kind"] }))}>
            <SelectTrigger aria-label="Filter review items by type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All review types</SelectItem>
              {Object.entries(REVIEW_KIND_LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.businessLine ?? "all"} onValueChange={(businessLine) => setFilters((current) => ({ ...current, businessLine: businessLine as PendingReviewFilters["businessLine"] }))}>
            <SelectTrigger aria-label="Filter review items by business line"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All business lines</SelectItem>
              {Object.entries(REVIEW_LINE_LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input aria-label="Review items submitted from" type="date" value={filters.submittedFrom} onChange={(event) => setFilters((current) => ({ ...current, submittedFrom: event.target.value }))} />
          <Input aria-label="Review items submitted to" type="date" min={filters.submittedFrom || undefined} value={filters.submittedTo} onChange={(event) => setFilters((current) => ({ ...current, submittedTo: event.target.value }))} />
          <Button className="sm:col-span-2 lg:col-span-3 xl:col-span-5" variant="outline" onClick={() => setFilters(EMPTY_FILTERS)}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Clear filters
          </Button>
        </div>

        <div className="min-h-0 overflow-y-auto pr-1">
          <p className="mb-3 text-sm text-text-secondary">
            {filteredItems.length} {filteredItems.length === 1 ? "item" : "items"} shown
          </p>
          <PendingReviewList items={filteredItems} emptyMessage="No loaded review items match these filters." />
        </div>

        <DialogClose asChild>
          <button
            type="button"
            aria-label="Close review filters"
            className={cn("absolute top-3 right-3", CLOSE_BUTTON_CLASS)}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
