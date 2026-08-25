"use client";

import * as React from "react";
import { Building2, LayoutGrid, MapPin, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PropertyFilterSheet } from "@/features/real-estate/property-filter-sheet";
import { useDebounce } from "@/hooks/use-debounce";
import { subtypeGroupsFor } from "@/lib/property-facet-map";
import {
  AMENITIES,
  BHK_OPTIONS,
  FURNISHING_OPTIONS,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  formatLakhs,
  type SuggestionIndex,
} from "@/lib/property-facets";
import { propertySubtypeOption } from "@/lib/property-taxonomy";
import {
  RE_CATEGORIES,
  type PropertyFilters,
  type RECategory,
  type RESubtype,
  type SortOrder,
} from "@/lib/real-estate";
import { cn } from "@/lib/utils";

const MAX_SUGGESTIONS_PER_GROUP = 4;

type Chip = { key: string; label: string; onRemove: () => void };

function arrayChips<T extends string | number>(
  values: T[] | undefined,
  labelFor: (value: T) => string,
  onChange: (next: T[] | undefined) => void,
): Chip[] {
  if (!values?.length) return [];
  return values.map((value) => ({
    key: `${String(value)}`,
    label: labelFor(value),
    onRemove: () => {
      const rest = values.filter((v) => v !== value);
      onChange(rest.length ? rest : undefined);
    },
  }));
}

function buildChips(filters: PropertyFilters, setFilters: (patch: Partial<PropertyFilters>) => void): Chip[] {
  const chips: Chip[] = [];

  if (filters.q?.trim()) {
    chips.push({ key: "q", label: `"${filters.q}"`, onRemove: () => setFilters({ q: undefined }) });
  }
  if (filters.locality) {
    chips.push({ key: "locality", label: filters.locality, onRemove: () => setFilters({ locality: undefined }) });
  }
  if (filters.pincode) {
    chips.push({ key: "pincode", label: `PIN ${filters.pincode}`, onRemove: () => setFilters({ pincode: undefined }) });
  }
  if (filters.city) {
    chips.push({ key: "city", label: filters.city, onRemove: () => setFilters({ city: undefined }) });
  }

  chips.push(
    ...arrayChips(
      filters.categories,
      (v) => RE_CATEGORIES.find((c) => c.key === v)?.label ?? v,
      (next) => setFilters({ categories: next }),
    ),
  );
  chips.push(
    ...arrayChips(
      filters.subtypes,
      (v) => propertySubtypeOption(v)?.label ?? v,
      (next) => setFilters({ subtypes: next }),
    ),
  );
  chips.push(
    ...arrayChips(
      filters.bhk,
      (v) => BHK_OPTIONS.find((b) => b.value === v)?.label ?? `${v} BHK`,
      (next) => setFilters({ bhk: next }),
    ),
  );

  if (filters.priceMin != null || filters.priceMax != null) {
    chips.push({
      key: "price",
      label: `${formatLakhs(filters.priceMin ?? 0)} - ${formatLakhs(filters.priceMax ?? filters.priceMin ?? 0)}`,
      onRemove: () => setFilters({ priceMin: undefined, priceMax: undefined }),
    });
  }
  if (filters.areaMin != null || filters.areaMax != null) {
    chips.push({
      key: "area",
      label: `${(filters.areaMin ?? 0).toLocaleString("en-IN")} - ${(filters.areaMax ?? filters.areaMin ?? 0).toLocaleString("en-IN")} sqft`,
      onRemove: () => setFilters({ areaMin: undefined, areaMax: undefined }),
    });
  }

  chips.push(
    ...arrayChips(
      filters.status,
      (v) => STATUS_OPTIONS.find((s) => s.value === v)?.label ?? v,
      (next) => setFilters({ status: next }),
    ),
  );
  chips.push(
    ...arrayChips(
      filters.furnishing,
      (v) => FURNISHING_OPTIONS.find((f) => f.value === v)?.label ?? v,
      (next) => setFilters({ furnishing: next }),
    ),
  );
  chips.push(
    ...arrayChips(
      filters.amenities,
      (v) => AMENITIES.find((a) => a.value === v)?.label ?? v,
      (next) => setFilters({ amenities: next }),
    ),
  );
  return chips;
}

function initialText(filters: PropertyFilters): string {
  return filters.locality ?? filters.city ?? filters.pincode ?? filters.q ?? "";
}

// Big omnibox (property name, locality, city, property type, or PIN code) plus
// the Filters Sheet trigger, a row of one-tap category pills, and a removable
// active-filter chip row underneath. Suggestions are grouped Localities/Cities/
// PIN codes/Property types/Properties, built from the API-backed suggestion
// index. Typing free text debounces into filters.q; picking a suggestion sets
// the matching structured facet directly.
//
// The field and its Search button read as one control rather than three
// adjacent boxes: search is the primary action on this screen, so it gets a
// single unmistakable target instead of competing chrome.
export function PropertySearchBar({
  filters,
  setFilters,
  clearAll,
  activeCount,
  resultCount,
  active = false,
  suggestionIndex,
  lockedCategory,
}: {
  filters: PropertyFilters;
  setFilters: (patch: Partial<PropertyFilters>) => void;
  clearAll: () => void;
  activeCount: number;
  resultCount: number;
  active?: boolean;
  // Scoped suggestion source built from the API-backed page, category, or
  // bookmark subset.
  suggestionIndex: SuggestionIndex;
  // When set, the Filters sheet hides the Property-type facet and the quick
  // category pills are suppressed (page is already pinned to this category).
  lockedCategory?: RECategory;
}) {
  const [text, setText] = React.useState(() => initialText(filters));
  const [open, setOpen] = React.useState(false);
  const debouncedText = useDebounce(text, 300);
  const syncingFromFilters = React.useRef(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    syncingFromFilters.current = true;
    setText(initialText(filters));
    // Only these four text-bearing facets should resync the input; other
    // facets (bhk, amenities, ...) change `filters`'s identity too often to
    // include the whole object here without fighting the user's typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q, filters.locality, filters.city, filters.pincode]);

  React.useEffect(() => {
    if (syncingFromFilters.current) {
      syncingFromFilters.current = false;
      return;
    }
    const trimmed = debouncedText.trim();
    setFilters({
      q: trimmed || undefined,
      locality: undefined,
      city: undefined,
      pincode: undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedText]);

  // Same rule the Filters sheet uses, so the omnibox never offers a subtype the
  // sheet withholds: only categories their subtype actually subdivides, and
  // only subtypes present in this result ceiling.
  const subtypeOptions = React.useMemo(
    () =>
      subtypeGroupsFor(
        lockedCategory ? [lockedCategory] : undefined,
        suggestionIndex.subtypes,
      ).flatMap((group) => group.items),
    [lockedCategory, suggestionIndex.subtypes],
  );

  const query = text.trim().toLowerCase();
  const matches = React.useMemo(() => {
    if (!query) return null;
    const contains = (value: string) => value.toLowerCase().includes(query);
    return {
      localities: suggestionIndex.localities.filter(contains).slice(0, MAX_SUGGESTIONS_PER_GROUP),
      cities: suggestionIndex.cities.filter(contains).slice(0, MAX_SUGGESTIONS_PER_GROUP),
      pincodes: suggestionIndex.pincodes.filter(contains).slice(0, MAX_SUGGESTIONS_PER_GROUP),
      subtypes: subtypeOptions
        .filter((item) => contains(item.label))
        .slice(0, MAX_SUGGESTIONS_PER_GROUP),
      properties: suggestionIndex.properties
        .filter((p) => contains(p.title))
        .slice(0, MAX_SUGGESTIONS_PER_GROUP),
    };
  }, [query, suggestionIndex, subtypeOptions]);

  const hasMatches = Boolean(
    matches &&
      (matches.localities.length ||
        matches.cities.length ||
        matches.pincodes.length ||
        matches.subtypes.length ||
        matches.properties.length),
  );

  function pickLocality(value: string) {
    syncingFromFilters.current = true;
    setText(value);
    setOpen(false);
    setFilters({ locality: value, q: undefined, city: undefined, pincode: undefined });
  }
  function pickCity(value: string) {
    syncingFromFilters.current = true;
    setText(value);
    setOpen(false);
    setFilters({ city: value, q: undefined, locality: undefined, pincode: undefined });
  }
  function pickPincode(value: string) {
    syncingFromFilters.current = true;
    setText(value);
    setOpen(false);
    setFilters({ pincode: value, q: undefined, locality: undefined, city: undefined });
  }
  function pickProperty(title: string) {
    syncingFromFilters.current = true;
    setText(title);
    setOpen(false);
    setFilters({ q: title, locality: undefined, city: undefined, pincode: undefined });
  }
  // A subtype is a facet, not a text query: clear the omnibox so the two never
  // constrain the results at once and leave the user unable to tell which is
  // doing the narrowing.
  function pickSubtype(value: RESubtype) {
    syncingFromFilters.current = true;
    setText("");
    setOpen(false);
    setFilters({
      subtypes: Array.from(new Set([...(filters.subtypes ?? []), value])),
      q: undefined,
      locality: undefined,
      city: undefined,
      pincode: undefined,
    });
  }

  function toggleCategory(key: RECategory) {
    const current = filters.categories ?? [];
    const next = current.includes(key)
      ? current.filter((value) => value !== key)
      : [...current, key];
    setFilters({ categories: next.length ? next : undefined });
  }

  function clearText() {
    setText("");
    setOpen(false);
    setFilters({ q: undefined, locality: undefined, city: undefined, pincode: undefined });
    inputRef.current?.focus();
  }

  function submitSearch() {
    const trimmed = text.trim();
    if (
      filters.locality === trimmed ||
      filters.city === trimmed ||
      filters.pincode === trimmed
    ) {
      setOpen(false);
      return;
    }
    setOpen(false);
    setFilters({
      q: trimmed || undefined,
      locality: undefined,
      city: undefined,
      pincode: undefined,
    });
  }

  const chips = buildChips(filters, setFilters);

  return (
    <div className="space-y-3">
      {/* flex-wrap + omnibox min-width: in a narrow container (e.g. the Bookmarks
          inline layout) the Sort/Filters controls drop to a second line instead
          of squeezing the search box thin. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Command shouldFilter={false} className="flex-1 overflow-visible bg-transparent sm:min-w-[280px]">
          <Popover open={open && query.length > 0} onOpenChange={setOpen}>
            <PopoverAnchor asChild>
              {/* One field: input, clear affordance, and the primary action
                  share a single border and a single focus ring. */}
              <div className="flex h-14 items-center rounded-xl border border-border bg-card pl-1 transition-colors focus-within:border-brand-cta focus-within:ring-2 focus-within:ring-brand-cta/25">
                <CommandInput
                  ref={inputRef}
                  value={text}
                  onValueChange={(value) => {
                    setText(value);
                    setOpen(true);
                  }}
                  onFocus={() => setOpen(true)}
                  // The placeholder is an example, not a label: it truncates on
                  // narrow viewports and disappears once the user types.
                  aria-label="Search properties"
                  placeholder="Search by locality, city, PIN code, or property name..."
                  wrapperClassName="h-full min-w-0 flex-1 border-b-0 px-3"
                  className="h-full text-base"
                />
                {text ? (
                  <button
                    type="button"
                    onClick={clearText}
                    aria-label="Clear search"
                    className="mr-1 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cta/40"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
                <Button
                  type="button"
                  className="m-1.5 h-11 shrink-0 rounded-lg px-5"
                  onClick={submitSearch}
                >
                  <Search className="h-4 w-4" aria-hidden="true" />
                  Search
                </Button>
              </div>
            </PopoverAnchor>
            <PopoverContent
              align="start"
              onOpenAutoFocus={(e) => e.preventDefault()}
              className="w-[var(--radix-popper-anchor-width)] p-0"
            >
              <CommandList>
                {!hasMatches ? <CommandEmpty>No matches for &quot;{text}&quot;</CommandEmpty> : null}
                {matches?.localities.length ? (
                  <CommandGroup heading="Localities">
                    {matches.localities.map((value) => (
                      <CommandItem key={value} value={value} onSelect={() => pickLocality(value)}>
                        <MapPin /> {value}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
                {matches?.cities.length ? (
                  <CommandGroup heading="Cities">
                    {matches.cities.map((value) => (
                      <CommandItem key={value} value={value} onSelect={() => pickCity(value)}>
                        <MapPin /> {value}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
                {matches?.pincodes.length ? (
                  <CommandGroup heading="PIN codes">
                    {matches.pincodes.map((value) => (
                      <CommandItem key={value} value={value} onSelect={() => pickPincode(value)}>
                        <MapPin /> {value}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
                {matches?.subtypes.length ? (
                  <CommandGroup heading="Property types">
                    {matches.subtypes.map((item) => (
                      <CommandItem
                        key={item.value}
                        value={item.label}
                        onSelect={() => pickSubtype(item.value)}
                      >
                        <LayoutGrid /> {item.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
                {matches?.properties.length ? (
                  <CommandGroup heading="Properties">
                    {matches.properties.map((p) => (
                      <CommandItem key={p.id} value={p.title} onSelect={() => pickProperty(p.title)}>
                        <Building2 /> {p.title}
                        <span className="ml-auto text-xs text-text-secondary">{p.locality}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
              </CommandList>
            </PopoverContent>
          </Popover>
        </Command>

        {active ? (
          <Select
            value={filters.sort ?? "relevance"}
            onValueChange={(value) => setFilters({ sort: value === "relevance" ? undefined : (value as SortOrder) })}
          >
            {/* Mirror the omnibox/Filters chrome: same h-14, rounded-xl, border,
                white (card) bg. Pointer + light-blue hover, no blue focus-border. */}
            {/* The trigger's text is the selected value ("Relevance"), which
                does not say what it controls. */}
            <SelectTrigger
              aria-label="Sort results"
              className="h-14 w-full cursor-pointer rounded-xl border-border bg-card px-4 hover:border-brand-cta hover:bg-brand-cta-tint hover:text-brand-cta focus-visible:border-brand-cta focus-visible:ring-brand-cta/40 data-[size=default]:h-14 sm:w-[190px]"
            >
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <PropertyFilterSheet
          filters={filters}
          setFilters={setFilters}
          clearAll={clearAll}
          activeCount={activeCount}
          resultCount={resultCount}
          lockedCategory={lockedCategory}
          suggestionIndex={suggestionIndex}
        />
      </div>

      {/* One-tap category narrowing. Picking a property type is the most common
          next move after a location, and it should not require opening a sheet
          to reach. Suppressed when the page is already pinned to a category. */}
      {lockedCategory ? null : (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by property type">
          {RE_CATEGORIES.map((category) => {
            const selected = (filters.categories ?? []).includes(category.key);
            const Icon = category.icon;
            return (
              <button
                key={category.key}
                type="button"
                onClick={() => toggleCategory(category.key)}
                aria-pressed={selected}
                className={cn(
                  "inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cta/40",
                  selected
                    ? "border-brand-cta bg-brand-cta-tint text-brand-cta"
                    : "border-border bg-card text-text-secondary hover:border-brand-cta hover:text-brand-cta",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {category.label}
              </button>
            );
          })}
        </div>
      )}

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <Badge
              key={chip.key}
              variant="outline"
              className={cn(
                "h-8 gap-1.5 rounded-full border-brand-cta/40 bg-nav-tint px-3 text-sm font-normal text-brand-cta",
              )}
            >
              {chip.label}
              <button
                type="button"
                onClick={chip.onRemove}
                aria-label={`Remove ${chip.label} filter`}
                className="cursor-pointer rounded-full hover:opacity-70"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="cursor-pointer text-sm font-medium text-text-secondary underline-offset-2 hover:text-brand-cta hover:underline"
          >
            Clear all
          </button>
        </div>
      ) : null}
    </div>
  );
}
