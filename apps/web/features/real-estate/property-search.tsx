"use client";

import * as React from "react";
import { Search } from "lucide-react";

import { IconInput } from "@/components/icon-input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LOCATIONS, RE_CATEGORIES, type PropertyFilters, type RECategory } from "@/lib/real-estate";

const BUDGETS: { label: string; maxLakhs: number }[] = [
  { label: "Up to ₹50 L", maxLakhs: 50 },
  { label: "Up to ₹1 Cr", maxLakhs: 100 },
  { label: "Up to ₹2 Cr", maxLakhs: 200 },
  { label: "Up to ₹5 Cr", maxLakhs: 500 },
];

const ANY = "any";

// Location + type + budget + keyword search bar for the real-estate dashboard
// home. Purely client-side filtering over the mock catalog; reports the active
// filters up so the caller decides between the category rows (no filters) and
// a filtered results grid.
export function PropertySearch({ onSearch }: { onSearch: (filters: PropertyFilters) => void }) {
  const [location, setLocation] = React.useState<string>(ANY);
  const [category, setCategory] = React.useState<string>(ANY);
  const [maxLakhs, setMaxLakhs] = React.useState<string>(ANY);
  const [q, setQ] = React.useState("");

  function search() {
    onSearch({
      location: location === ANY ? undefined : location,
      category: category === ANY ? undefined : (category as RECategory),
      maxLakhs: maxLakhs === ANY ? undefined : Number(maxLakhs),
      q: q.trim() || undefined,
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1.4fr_auto]">
        <Select value={location} onValueChange={setLocation}>
          <SelectTrigger className="h-11 w-full">
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any location</SelectItem>
            {LOCATIONS.map((loc) => (
              <SelectItem key={loc} value={loc}>
                {loc}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-11 w-full">
            <SelectValue placeholder="Property type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any type</SelectItem>
            {RE_CATEGORIES.map((c) => (
              <SelectItem key={c.key} value={c.key}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={maxLakhs} onValueChange={setMaxLakhs}>
          <SelectTrigger className="h-11 w-full">
            <SelectValue placeholder="Budget" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any budget</SelectItem>
            {BUDGETS.map((b) => (
              <SelectItem key={b.maxLakhs} value={String(b.maxLakhs)}>
                {b.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <IconInput
          icon={Search}
          placeholder="Search by title, locality..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          className="h-11"
        />

        <Button onClick={search} className="h-11 w-full lg:w-auto">
          Search
        </Button>
      </div>
    </div>
  );
}
