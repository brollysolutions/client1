"use client";

import * as React from "react";
import { SlidersHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { PropertyFilterBody } from "@/features/real-estate/property-filter-body";
import type { PropertyFilters } from "@/lib/real-estate";

// Right-side "All filters" panel: full facet set from PropertyFilterBody, with
// a sticky footer that shows the live result count for the in-progress
// selection and a way to clear everything. Chosen over a popover so the long
// facet list has room to breathe (99acres/Housing.com pattern) and works well
// on mobile as a full-width panel.
export function PropertyFilterSheet({
  filters,
  setFilters,
  clearAll,
  activeCount,
  resultCount,
}: {
  filters: PropertyFilters;
  setFilters: (patch: Partial<PropertyFilters>) => void;
  clearAll: () => void;
  activeCount: number;
  resultCount: number;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="h-12 gap-2 rounded-lg px-5">
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {activeCount > 0 ? (
            <Badge className="ml-0.5 bg-brand-cta text-surface">{activeCount}</Badge>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-6 py-5 text-left">
          <SheetTitle>All filters</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <PropertyFilterBody filters={filters} setFilters={setFilters} />
        </div>

        <SheetFooter className="border-t border-border px-6 py-4 sm:flex-row sm:justify-between sm:space-x-3">
          <Button variant="ghost" onClick={clearAll} disabled={activeCount === 0}>
            Clear all
          </Button>
          <Button onClick={() => setOpen(false)} className="w-full sm:w-auto">
            Show {resultCount} home{resultCount === 1 ? "" : "s"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
