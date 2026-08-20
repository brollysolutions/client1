"use client";

import * as React from "react";
import { Building2, Crosshair, Loader2, MapPin, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PropertyFilterSheet } from "@/features/real-estate/property-filter-sheet";
import { useDebounce } from "@/hooks/use-debounce";
import {
  currentLocationErrorMessage,
  useCurrentLocationLookup,
} from "@/hooks/use-current-location-lookup";
import {
  AMENITIES,
  BHK_OPTIONS,
  FURNISHING_OPTIONS,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  SUGGESTION_INDEX,
  formatLakhs,
  matchCurrentLocationToPropertyFacet,
  type SuggestionIndex,
} from "@/lib/property-facets";
import { RE_CATEGORIES, type PropertyFilters, type RECategory, type SortOrder } from "@/lib/real-estate";
import { REVERSE_GEOCODE_PROVIDER_LABEL } from "@/lib/reverse-geocode";
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

// Big omnibox (property name, locality, city, or PIN code) plus the Filters
// Sheet trigger and a removable active-filter chip row underneath. Suggestions
// are grouped Localities/Cities/PIN codes/Properties, built from
// lib/property-facets.ts#SUGGESTION_INDEX. Typing free text debounces into
// filters.q; picking a suggestion sets the matching structured facet directly.
export function PropertySearchBar({
  filters,
  setFilters,
  clearAll,
  activeCount,
  resultCount,
  active = false,
  suggestionIndex = SUGGESTION_INDEX,
  lockedCategory,
}: {
  filters: PropertyFilters;
  setFilters: (patch: Partial<PropertyFilters>) => void;
  clearAll: () => void;
  activeCount: number;
  resultCount: number;
  active?: boolean;
  // Scoped suggestion source (built from a category/bookmark subset); defaults
  // to the whole-catalog index.
  suggestionIndex?: SuggestionIndex;
  // When set, the Filters sheet hides the Property-type facet (page is already
  // pinned to this category).
  lockedCategory?: RECategory;
}) {
  const [text, setText] = React.useState(() => initialText(filters));
  const [open, setOpen] = React.useState(false);
  const [locationFeedback, setLocationFeedback] = React.useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const locationFeedbackId = React.useId();
  const { available, locating, findCurrentLocation } = useCurrentLocationLookup();
  const debouncedText = useDebounce(text, 300);
  const syncingFromFilters = React.useRef(false);

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

  const query = text.trim().toLowerCase();
  const matches = React.useMemo(() => {
    if (!query) return null;
    const contains = (value: string) => value.toLowerCase().includes(query);
    return {
      localities: suggestionIndex.localities.filter(contains).slice(0, MAX_SUGGESTIONS_PER_GROUP),
      cities: suggestionIndex.cities.filter(contains).slice(0, MAX_SUGGESTIONS_PER_GROUP),
      pincodes: suggestionIndex.pincodes.filter(contains).slice(0, MAX_SUGGESTIONS_PER_GROUP),
      properties: suggestionIndex.properties
        .filter((p) => contains(p.title))
        .slice(0, MAX_SUGGESTIONS_PER_GROUP),
    };
  }, [query, suggestionIndex]);

  const hasMatches = Boolean(
    matches &&
      (matches.localities.length ||
        matches.cities.length ||
        matches.pincodes.length ||
        matches.properties.length),
  );

  function pickLocality(value: string) {
    setLocationFeedback(null);
    syncingFromFilters.current = true;
    setText(value);
    setOpen(false);
    setFilters({ locality: value, q: undefined, city: undefined, pincode: undefined });
  }
  function pickCity(value: string) {
    setLocationFeedback(null);
    syncingFromFilters.current = true;
    setText(value);
    setOpen(false);
    setFilters({ city: value, q: undefined, locality: undefined, pincode: undefined });
  }
  function pickPincode(value: string) {
    setLocationFeedback(null);
    syncingFromFilters.current = true;
    setText(value);
    setOpen(false);
    setFilters({ pincode: value, q: undefined, locality: undefined, city: undefined });
  }
  function pickProperty(title: string) {
    setLocationFeedback(null);
    syncingFromFilters.current = true;
    setText(title);
    setOpen(false);
    setFilters({ q: title, locality: undefined, city: undefined, pincode: undefined });
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

  async function handleCurrentLocationSearch() {
    setOpen(false);
    setLocationFeedback(null);
    try {
      const location = await findCurrentLocation();
      const match = matchCurrentLocationToPropertyFacet(location, suggestionIndex);
      syncingFromFilters.current = true;
      setText(match.value);
      if (match.kind === "locality") {
        setFilters({
          locality: match.value,
          city: match.city,
          pincode: undefined,
          q: undefined,
        });
      } else if (match.kind === "city") {
        setFilters({ city: match.value, locality: undefined, pincode: undefined, q: undefined });
      } else {
        setFilters({ q: match.value, locality: undefined, city: undefined, pincode: undefined });
      }
      setLocationFeedback({
        kind: "success",
        message: `Searching properties near ${match.value}.`,
      });
    } catch (error) {
      setLocationFeedback({ kind: "error", message: currentLocationErrorMessage(error) });
    }
  }

  const selectedLocation = filters.locality
    ? `locality:${filters.locality}`
    : filters.city
      ? `city:${filters.city}`
      : filters.pincode
        ? `pincode:${filters.pincode}`
        : undefined;

  function selectLocation(value: string) {
    const separator = value.indexOf(":");
    const kind = value.slice(0, separator);
    const location = value.slice(separator + 1);
    if (kind === "locality") pickLocality(location);
    else if (kind === "city") pickCity(location);
    else pickPincode(location);
  }

  const chips = buildChips(filters, setFilters);

  return (
    <div className="space-y-3">
      {/* flex-wrap + omnibox min-width: in a narrow container (e.g. the Bookmarks
          inline layout) the Sort/Filters controls drop to a second line instead
          of squeezing the search box thin. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Command shouldFilter={false} className="flex-1 overflow-visible bg-transparent sm:min-w-[240px]">
          <Popover open={open && query.length > 0} onOpenChange={setOpen}>
            <PopoverAnchor asChild>
              <div>
                <CommandInput
                  value={text}
                  onValueChange={(value) => {
                    setLocationFeedback(null);
                    setText(value);
                    setOpen(true);
                  }}
                  onFocus={() => setOpen(true)}
                  disabled={locating}
                  placeholder="Search by locality, city, PIN code, or property name..."
                  wrapperClassName="h-12 rounded-lg border border-border bg-card px-4"
                  className="text-base"
                />
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

        {available ? (
          <Button
            type="button"
            variant="outline"
            className="h-12 shrink-0 px-4"
            disabled={locating}
            onClick={handleCurrentLocationSearch}
            aria-describedby={`${locationFeedbackId}-help${
              locationFeedback ? ` ${locationFeedbackId}-feedback` : ""
            }`}
          >
            {locating ? (
              <Loader2
                className="h-4 w-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <Crosshair className="h-4 w-4" aria-hidden="true" />
            )}
            {locating ? "Finding location…" : "Use current location"}
          </Button>
        ) : null}

        <Button
          type="button"
          className="h-12 shrink-0 px-5 sm:w-auto"
          disabled={locating}
          onClick={submitSearch}
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          Search
        </Button>

        <Select value={selectedLocation} onValueChange={selectLocation} disabled={locating}>
          <SelectTrigger
            aria-label="Choose property location"
            className="h-12 w-full cursor-pointer rounded-lg border-border bg-card px-4 hover:border-brand-cta hover:bg-brand-cta-tint hover:text-brand-cta focus-visible:border-brand-cta focus-visible:ring-brand-cta/40 data-[size=default]:h-12 sm:w-[190px]"
          >
            <MapPin className="h-4 w-4 text-brand-cta" aria-hidden="true" />
            <SelectValue placeholder="Choose location" />
          </SelectTrigger>
          <SelectContent>
            {suggestionIndex.localities.length ? (
              <SelectGroup>
                <SelectLabel>Localities</SelectLabel>
                {suggestionIndex.localities.slice(0, 12).map((location) => (
                  <SelectItem key={`locality:${location}`} value={`locality:${location}`}>
                    {location}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
            {suggestionIndex.cities.length ? (
              <SelectGroup>
                <SelectLabel>Cities</SelectLabel>
                {suggestionIndex.cities.slice(0, 12).map((location) => (
                  <SelectItem key={`city:${location}`} value={`city:${location}`}>
                    {location}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
            {suggestionIndex.pincodes.length ? (
              <SelectGroup>
                <SelectLabel>PIN codes</SelectLabel>
                {suggestionIndex.pincodes.slice(0, 12).map((location) => (
                  <SelectItem key={`pincode:${location}`} value={`pincode:${location}`}>
                    {location}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
          </SelectContent>
        </Select>

        {active ? (
          <Select
            value={filters.sort ?? "relevance"}
            onValueChange={(value) => setFilters({ sort: value === "relevance" ? undefined : (value as SortOrder) })}
          >
            {/* Mirror the omnibox/Filters chrome: same h-12, rounded-lg, border,
                white (card) bg. Pointer + light-blue hover, no blue focus-border. */}
            <SelectTrigger className="h-12 w-full cursor-pointer rounded-lg border-border bg-card px-4 hover:border-brand-cta hover:bg-brand-cta-tint hover:text-brand-cta focus-visible:border-brand-cta focus-visible:ring-brand-cta/40 data-[size=default]:h-12 sm:w-[190px]">
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
          disabled={locating}
        />
      </div>

      {available ? (
        <div className="space-y-1">
          <p id={`${locationFeedbackId}-help`} className="text-xs text-text-secondary">
            Current location sends an approximate position, rounded to two decimals, to
            {` ${REVERSE_GEOCODE_PROVIDER_LABEL} `}and uses only the matched city or locality as a
            search filter.
          </p>
          {locationFeedback ? (
            <p
              id={`${locationFeedbackId}-feedback`}
              role={locationFeedback.kind === "error" ? "alert" : "status"}
              className={
                locationFeedback.kind === "error"
                  ? "text-xs text-destructive"
                  : "text-xs text-success"
              }
            >
              {locationFeedback.message}
            </p>
          ) : null}
        </div>
      ) : null}

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
