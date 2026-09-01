"use client";

import * as React from "react";
import { ChevronDownIcon, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { searchPayoutRecipients, type PayoutRecipient } from "@/lib/payouts-api";
import type { PayoutRecipientChoice } from "@/lib/payout-form";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

const KIND_LABEL: Record<string, string> = {
  client: "Client",
  agent: "Agent",
  staff: "Staff",
};

type SearchStatus = "idle" | "loading" | "ready" | "error";

// Async recipient combobox for the payout create form. Modeled on
// components/ui/searchable-select.tsx (Popover + Command) but that component
// takes a static string[] — this one debounces a server search instead, so it
// is a structural reference, not something to reuse directly.
export function RecipientPicker({
  value,
  onChange,
  id,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: {
  value: PayoutRecipientChoice | null;
  onChange: (value: PayoutRecipientChoice | null) => void;
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const generatedId = React.useId();
  const triggerId = id ?? generatedId;
  const optionsId = `${triggerId}-options`;
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [hits, setHits] = React.useState<PayoutRecipient[]>([]);
  const [status, setStatus] = React.useState<SearchStatus>("idle");
  const [forbidden, setForbidden] = React.useState(false);

  React.useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setHits([]);
      setStatus("idle");
      return;
    }
    let active = true;
    setStatus("loading");
    const timer = setTimeout(() => {
      void searchPayoutRecipients(trimmed).then((res) => {
        if (!active) return;
        if (!res.ok) {
          if (res.status === 403) setForbidden(true);
          setStatus("error");
          return;
        }
        setHits(res.data);
        setStatus("ready");
      });
    }, DEBOUNCE_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  function pick(hit: PayoutRecipient) {
    onChange({ authUserUuid: hit.auth_user_uuid, name: hit.name, code: hit.codes[0] ?? null });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={triggerId}
          type="button"
          role="combobox"
          aria-controls={optionsId}
          aria-expanded={open}
          aria-required="true"
          disabled={forbidden}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          className={cn(
            "flex h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
            !value && "text-muted-foreground",
          )}
        >
          <span className="truncate">
            {value ? `${value.name}${value.code ? ` · ${value.code}` : ""}` : "Choose a recipient"}
          </span>
          <ChevronDownIcon className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      {forbidden ? (
        <p className="mt-1 text-xs text-destructive">
          Recipient lookup is restricted to platform admins.
        </p>
      ) : (
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={(value) => setQuery(value.slice(0, 100))}
              placeholder="Search by name, code, or mobile"
            />
            <CommandList id={optionsId}>
              {query.trim().length < MIN_QUERY_LENGTH ? (
                <CommandEmpty>Type at least 2 characters</CommandEmpty>
              ) : status === "loading" ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-text-secondary" />
                </div>
              ) : status === "error" ? (
                <CommandEmpty>Search failed. Try again.</CommandEmpty>
              ) : hits.length === 0 ? (
                <CommandEmpty>No matching account.</CommandEmpty>
              ) : (
                <>
                  {value ? (
                    <CommandItem value="__clear" onSelect={() => { onChange(null); setOpen(false); }}>
                      Clear
                    </CommandItem>
                  ) : null}
                  {hits.map((hit) => (
                    <CommandItem
                      key={hit.auth_user_uuid}
                      value={hit.auth_user_uuid}
                      onSelect={() => pick(hit)}
                    >
                      <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate">{hit.name}</p>
                          <p className="truncate text-xs text-text-secondary">
                            {hit.codes.join(" · ")} · ••••{hit.mobile_last4}
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0">
                          {KIND_LABEL[hit.kind] ?? hit.kind}
                        </Badge>
                      </div>
                    </CommandItem>
                  ))}
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      )}
    </Popover>
  );
}
