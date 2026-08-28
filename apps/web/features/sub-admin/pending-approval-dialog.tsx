"use client";

import * as React from "react";
import { Maximize2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EMPTY_FILTERS, FilterBar, type FilterBarValue } from "@/features/dashboard/filter-bar";
import type { PendingApprovalItem } from "@/lib/sub-admin-api";

import { CmsWorkspaceHeader, CMS_WORKSPACE_DIALOG_CLASS } from "./cms-workspace";
import { PendingApprovalList } from "./pending-approval-list";

export function PendingApprovalDialog({ items }: { items: PendingApprovalItem[] }) {
  const [open, setOpen] = React.useState(false);
  const [filters, setFilters] = React.useState<FilterBarValue>(EMPTY_FILTERS);
  const filtered = React.useMemo(() => items.filter((item) => {
    const day = item.submitted_at.slice(0, 10);
    return item.title.toLowerCase().includes(filters.search.trim().toLowerCase()) && (filters.line === "all" || item.business_line === filters.line) && (filters.kind === "all" || item.kind === filters.kind) && (!filters.from || day >= filters.from) && (!filters.to || day <= filters.to);
  }), [filters, items]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Maximize2 className="h-4 w-4" aria-hidden="true" />Review filters</Button>
      <div hidden={!open} />
      {open ? (
        <div className="contents">
          <DialogContent showCloseButton={false} className={CMS_WORKSPACE_DIALOG_CLASS}>
            <CmsWorkspaceHeader title="Waiting on Admin" description={`Filter all ${items.length} approval items currently loaded for your work.`} />
            <div className="min-h-0 space-y-4 overflow-y-auto pt-1">
              <FilterBar value={filters} onChange={setFilters} searchLabel="Search approval items" searchPlaceholder="Title" showStatus={false} kindLabel="review types" kindOptions={[{ value: "banner", label: "Banner" }, { value: "property_submission", label: "Property listing" }]} note="Filters apply to the approval items already loaded for your role." />
              <p className="text-sm text-text-secondary">{filtered.length} {filtered.length === 1 ? "item" : "items"} shown</p>
              <PendingApprovalList items={filtered} emptyMessage="No loaded items match these filters." />
            </div>
          </DialogContent>
        </div>
      ) : null}
    </Dialog>
  );
}
