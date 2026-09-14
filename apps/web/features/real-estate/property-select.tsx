"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { REListing } from "@/lib/real-estate";

export function PropertySelect({ id, properties, value, onChange, disabled, errorId }: {
  id: string;
  properties: Pick<REListing, "id" | "title" | "location">[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  errorId?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const selected = properties.find((property) => property.id === value);
  const matches = React.useMemo(() => {
    const words = search.toLocaleLowerCase().trim().split(/\s+/);
    return properties.filter((property) => {
      const text = `${property.title} ${property.location}`.toLocaleLowerCase();
      return words.every((word) => text.includes(word));
    });
  }, [properties, search]);
  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} aria-required="true" aria-invalid={Boolean(errorId)} aria-describedby={errorId} disabled={disabled} className="h-auto min-h-11 w-full justify-between text-left font-normal">
          <span className="min-w-0 truncate">{selected ? `${selected.title} · ${selected.location}` : disabled ? "Loading properties…" : "Search and choose a property"}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command shouldFilter={false}>
          <CommandInput aria-label="Search properties" placeholder="Search property name or location" value={search} onValueChange={setSearch} maxLength={120} />
          <CommandList>
            {matches.length === 0 ? <p className="p-5 text-center text-sm text-text-secondary">{properties.length ? "No properties match your search." : "No properties are available yet."}</p> : null}
            {matches.slice(0, 50).map((property) => (
              <CommandItem key={property.id} value={property.id} onSelect={() => { onChange(property.id); setOpen(false); setSearch(""); }} className="min-h-12">
                <Check className={`h-4 w-4 shrink-0 ${value === property.id ? "opacity-100" : "opacity-0"}`} aria-hidden />
                <span className="min-w-0"><span className="block break-words font-medium">{property.title}</span><span className="block break-words text-xs text-text-secondary">{property.location}</span></span>
              </CommandItem>
            ))}
          </CommandList>
          {matches.length > 50 ? <p className="border-t border-border px-3 py-2 text-xs text-text-secondary" role="status">Showing 50 of {matches.length} properties. Refine your search to find more.</p> : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
