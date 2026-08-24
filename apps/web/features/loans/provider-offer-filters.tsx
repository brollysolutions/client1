import { Search, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProviderType } from "@/lib/financial-catalog";

export const PROVIDER_TYPE_LABEL: Record<ProviderType, string> = {
  bank: "Bank",
  small_finance_bank: "Small finance bank",
  nbfc: "NBFC",
  hfc: "Housing finance company",
  fintech: "Fintech",
  other: "Financial provider",
};

// Server-rendered filter bar for the Explore product page's lender list.
// A plain form (no client island, no query-string library) mirrors the public
// /loans/[slug] page's progressive-enhancement model: submitting re-requests
// this same route with the fields as query params, which the page reads on
// the server. Scoped to search, provider type, and sort per the agreed
// design -- no amount/rate/tenure accordion here.
export function ProviderOfferFilters({
  q,
  providerType,
  sort,
}: {
  q?: string;
  providerType?: ProviderType;
  sort: "recommended" | "interest_rate" | "amount" | "updated";
}) {
  return (
    <form className="sticky top-14 z-10 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="grid gap-4 lg:grid-cols-[1fr_14rem_14rem_auto] lg:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="provider-search">Search lenders</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
              aria-hidden
            />
            <Input
              id="provider-search"
              name="provider_q"
              defaultValue={q}
              placeholder="Lender or offer name"
              className="pl-9"
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="provider-type">Provider type</Label>
          <select
            id="provider-type"
            name="provider_type"
            defaultValue={providerType ?? ""}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All provider types</option>
            {Object.entries(PROVIDER_TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="provider-sort">Sort by</Label>
          <select
            id="provider-sort"
            name="sort"
            defaultValue={sort}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="recommended">Recommended order</option>
            <option value="interest_rate">Lowest starting rate</option>
            <option value="amount">Highest available amount</option>
            <option value="updated">Recently verified</option>
          </select>
        </div>
        <Button type="submit">
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          Apply filters
        </Button>
      </div>
    </form>
  );
}
