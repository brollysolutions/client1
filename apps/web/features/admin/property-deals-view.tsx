"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Home, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PropertyDealProgressControls,
  STATUS_LABEL,
  type PropertyDealStatus,
} from "@/features/property-deals/property-deal-progress-controls";

import { useAdminPropertyDeals } from "./use-admin-property-deals";

const FILTER_OPTIONS: { value: PropertyDealStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  ...(Object.entries(STATUS_LABEL) as [PropertyDealStatus, string][]).map(([value, label]) => ({
    value,
    label,
  })),
];

export function PropertyDealsView() {
  const [statusFilter, setStatusFilter] = React.useState<PropertyDealStatus | "all">("all");
  const { deals, loading, error, reload, updateDeal } = useAdminPropertyDeals(
    statusFilter === "all" ? undefined : statusFilter,
  );
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Property deals</h1>
          <p className="text-sm text-text-secondary">
            Track every real-estate deal through site visit, negotiation, and booking.
          </p>
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTER_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-border bg-card py-16">
          <Loader2 className="h-6 w-6 animate-spin text-brand-navy" aria-hidden="true" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-text-secondary">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => void reload()}>
            Try again
          </Button>
        </div>
      ) : deals.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-12 text-center">
          <Home className="h-8 w-8 text-text-secondary" aria-hidden="true" />
          <p className="mt-3 font-medium text-text-primary">No property deals yet</p>
          <p className="mt-1 text-sm text-text-secondary">
            Deals telecallers open against real-estate leads will show up here.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {deals.map((deal) => {
            const expanded = expandedId === deal.id;
            return (
              <li key={deal.id} className="rounded-2xl border border-border bg-card">
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : deal.id)}
                  className="flex w-full items-center justify-between gap-4 p-4 text-left"
                  aria-expanded={expanded}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-text-primary">{deal.property_title}</p>
                    <p className="mt-0.5 truncate text-xs text-text-secondary">
                      {deal.customer_code}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Badge variant="secondary">{STATUS_LABEL[deal.status]}</Badge>
                    {expanded ? (
                      <ChevronUp className="h-4 w-4 text-text-secondary" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-text-secondary" aria-hidden="true" />
                    )}
                  </div>
                </button>
                {expanded ? (
                  <div className="border-t border-border px-4 pb-4">
                    <PropertyDealProgressControls
                      deal={deal}
                      onUpdate={(payload) => updateDeal(deal.id, payload)}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
