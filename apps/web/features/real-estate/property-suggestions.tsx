"use client";

import * as React from "react";
import { Building2, LayoutGrid, MapPin } from "lucide-react";

import { CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { subtypeGroupsFor } from "@/lib/property-facet-map";
import type { SuggestionIndex } from "@/lib/property-facets";
import type { RECategory, RESubtype } from "@/lib/real-estate";

const MAX_SUGGESTIONS_PER_GROUP = 4;

export type SuggestionMatches = {
  localities: string[];
  cities: string[];
  pincodes: string[];
  subtypes: { value: RESubtype; label: string }[];
  properties: { id: string; title: string; locality: string }[];
};

// Shared "what matches this query" derivation for every property search field
// -- PropertySearchBar's omnibox (Explore, category pages, Bookmarks) and
// Home's quick search both need the exact same grouping/ranking/limits, so
// this lives in one place instead of drifting between two copies.
export function useSuggestionMatches(
  text: string,
  suggestionIndex: SuggestionIndex,
  lockedCategory?: RECategory,
): { matches: SuggestionMatches | null; hasMatches: boolean } {
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
  const matches = React.useMemo<SuggestionMatches | null>(() => {
    if (!query) return null;
    const contains = (value: string) => value.toLowerCase().includes(query);
    return {
      localities: suggestionIndex.localities.filter(contains).slice(0, MAX_SUGGESTIONS_PER_GROUP),
      cities: suggestionIndex.cities.filter(contains).slice(0, MAX_SUGGESTIONS_PER_GROUP),
      pincodes: suggestionIndex.pincodes.filter(contains).slice(0, MAX_SUGGESTIONS_PER_GROUP),
      subtypes: subtypeOptions.filter((item) => contains(item.label)).slice(0, MAX_SUGGESTIONS_PER_GROUP),
      properties: suggestionIndex.properties.filter((p) => contains(p.title)).slice(0, MAX_SUGGESTIONS_PER_GROUP),
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

  return { matches, hasMatches };
}

// Grouped Localities/Cities/PIN codes/Property types/Properties list, rendered
// inside a Command popover. Picking behavior is left to the caller: Explore's
// omnibox sets a URL-backed filter facet directly, while Home's quick search
// hands off to Explore instead (it owns no filter state of its own).
export function SuggestionsList({
  matches,
  hasMatches,
  queryText,
  onPickLocality,
  onPickCity,
  onPickPincode,
  onPickSubtype,
  onPickProperty,
}: {
  matches: SuggestionMatches | null;
  hasMatches: boolean;
  queryText: string;
  onPickLocality: (value: string) => void;
  onPickCity: (value: string) => void;
  onPickPincode: (value: string) => void;
  onPickSubtype: (value: RESubtype) => void;
  onPickProperty: (title: string) => void;
}) {
  return (
    <CommandList>
      {!hasMatches ? <CommandEmpty>No matches for &quot;{queryText}&quot;</CommandEmpty> : null}
      {matches?.localities.length ? (
        <CommandGroup heading="Localities">
          {matches.localities.map((value) => (
            <CommandItem key={value} value={value} onSelect={() => onPickLocality(value)}>
              <MapPin /> {value}
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}
      {matches?.cities.length ? (
        <CommandGroup heading="Cities">
          {matches.cities.map((value) => (
            <CommandItem key={value} value={value} onSelect={() => onPickCity(value)}>
              <MapPin /> {value}
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}
      {matches?.pincodes.length ? (
        <CommandGroup heading="PIN codes">
          {matches.pincodes.map((value) => (
            <CommandItem key={value} value={value} onSelect={() => onPickPincode(value)}>
              <MapPin /> {value}
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}
      {matches?.subtypes.length ? (
        <CommandGroup heading="Property types">
          {matches.subtypes.map((item) => (
            <CommandItem key={item.value} value={item.label} onSelect={() => onPickSubtype(item.value)}>
              <LayoutGrid /> {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}
      {matches?.properties.length ? (
        <CommandGroup heading="Properties">
          {matches.properties.map((p) => (
            <CommandItem key={p.id} value={p.title} onSelect={() => onPickProperty(p.title)}>
              <Building2 /> {p.title}
              <span className="ml-auto text-xs text-text-secondary">{p.locality}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}
    </CommandList>
  );
}
