"use client";

import * as React from "react";
import { Check, ChevronsUpDown, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AdminProperty } from "@/lib/properties-api";
import { cn } from "@/lib/utils";

function propertyLabel(property: AdminProperty): string {
  const compliance = property.rera_number ? `RERA ${property.rera_number}` : "RERA exemption";
  return `${property.title} · ${property.location} · ${compliance}`;
}

export function PropertyCampaignSelect({
  id,
  properties,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  properties: AdminProperty[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = properties.find((property) => property.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-11 w-full justify-between px-3 font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? propertyLabel(selected) : "Search an active verified property"}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder="Search title, location, or RERA status" maxLength={100} />
          <CommandList>
            <CommandEmpty>No matching active properties.</CommandEmpty>
            <CommandItem
              value="No linked property use category artwork only"
              onSelect={() => {
                onChange("");
                setOpen(false);
              }}
            >
              <Check
                className={cn("h-4 w-4", value ? "opacity-0" : "opacity-100")}
                aria-hidden
              />
              <span>Use category artwork only</span>
            </CommandItem>
            {properties.map((property) => (
              <CommandItem
                key={property.id}
                value={`${propertyLabel(property)} ${property.id}`}
                disabled={!property.active}
                onSelect={() => {
                  onChange(property.id);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn("h-4 w-4", property.id === value ? "opacity-100" : "opacity-0")}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{property.title} · {property.location}</span>
                {property.active ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs text-amber-800">
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                    RERA
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-destructive">Inactive</span>
                )}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
