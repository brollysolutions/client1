"use client";

import * as React from "react";
import { ChevronDownIcon } from "lucide-react";

import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Generic single-value searchable combobox: a Select-styled trigger button
// that opens a Command palette for typeahead filtering. Used where a plain
// Select's fixed-height dropdown doesn't scale to long option lists (city,
// locality). Selecting the already-chosen option (or the "Clear" row) resets
// back to "any".
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  options: string[];
  placeholder: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);

  function pick(next: string) {
    onChange(next === value ? undefined : next);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{value ?? placeholder}</span>
          <ChevronDownIcon className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            {value ? (
              <CommandItem value="__clear" onSelect={() => pick(value)}>
                Clear
              </CommandItem>
            ) : null}
            {options.map((option) => (
              <CommandItem key={option} value={option} onSelect={() => pick(option)}>
                {option}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
