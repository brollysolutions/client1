"use client";

import * as React from "react";
import { Crosshair, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  currentLocationErrorMessage,
  useCurrentLocationLookup,
} from "@/hooks/use-current-location-lookup";
import {
  AMENITIES,
  BHK_OPTIONS,
  CITIES,
  FURNISHING_OPTIONS,
  PRICE_BOUNDS,
  AREA_BOUNDS,
  STATUS_OPTIONS,
  SUGGESTION_INDEX,
  formatLakhs,
  matchCurrentLocationToPropertyFacet,
  type SuggestionIndex,
} from "@/lib/property-facets";
import {
  RE_CATEGORIES,
  RE_LISTINGS,
  type Furnishing,
  type ListingStatus,
  type PropertyFilters,
  type RECategory,
} from "@/lib/real-estate";
import { REVERSE_GEOCODE_PROVIDER_LABEL } from "@/lib/reverse-geocode";

const RESIDENTIAL_CATEGORIES: RECategory[] = ["houses", "apartments", "villas"];

// Shell-agnostic grouped facet controls. Rendered inside PropertyFilterSheet;
// kept separate so the facet set can be reused (e.g. in a future desktop
// popover shell) without pulling in the Sheet chrome.
export function PropertyFilterBody({
  filters,
  setFilters,
  lockedCategory,
  suggestionIndex = SUGGESTION_INDEX,
}: {
  filters: PropertyFilters;
  setFilters: (patch: Partial<PropertyFilters>) => void;
  // When the page is pinned to one category, hide the Property-type facet and
  // derive residential-only sections from that category.
  lockedCategory?: RECategory;
  suggestionIndex?: SuggestionIndex;
}) {
  const [priceDraft, setPriceDraft] = React.useState<[number, number]>([
    filters.priceMin ?? PRICE_BOUNDS.min,
    filters.priceMax ?? PRICE_BOUNDS.max,
  ]);
  const [areaDraft, setAreaDraft] = React.useState<[number, number]>([
    filters.areaMin ?? AREA_BOUNDS.min,
    filters.areaMax ?? AREA_BOUNDS.max,
  ]);
  const [locationFeedback, setLocationFeedback] = React.useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const locationFeedbackId = React.useId();
  const { available, locating, findCurrentLocation } = useCurrentLocationLookup();

  React.useEffect(() => {
    setPriceDraft([filters.priceMin ?? PRICE_BOUNDS.min, filters.priceMax ?? PRICE_BOUNDS.max]);
  }, [filters.priceMin, filters.priceMax]);

  React.useEffect(() => {
    setAreaDraft([filters.areaMin ?? AREA_BOUNDS.min, filters.areaMax ?? AREA_BOUNDS.max]);
  }, [filters.areaMin, filters.areaMax]);

  function toggleArrayValue<T extends string>(current: T[] | undefined, value: T): T[] | undefined {
    const set = new Set(current ?? []);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    return set.size > 0 ? Array.from(set) : undefined;
  }

  // Plots and commercial units have no bedroom count, construction status, or
  // furnishing state, so those sections only render when the selected
  // property types could plausibly have them (or when no type is chosen yet).
  const activeCategories = lockedCategory ? [lockedCategory] : filters.categories;
  const showResidentialFields =
    !activeCategories?.length ||
    activeCategories.some((c) => RESIDENTIAL_CATEGORIES.includes(c));

  const localityOptions = filters.city
    ? Array.from(
        new Set(RE_LISTINGS.filter((l) => l.city === filters.city).map((l) => l.locality)),
      ).sort()
    : SUGGESTION_INDEX.localities;

  async function handleCurrentLocationFilter() {
    setLocationFeedback(null);
    try {
      const location = await findCurrentLocation();
      const match = matchCurrentLocationToPropertyFacet(location, suggestionIndex);
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
        message: `Using ${match.value} for this search.`,
      });
    } catch (error) {
      setLocationFeedback({ kind: "error", message: currentLocationErrorMessage(error) });
    }
  }

  return (
    <div className="space-y-7">
      {lockedCategory ? null : (
        <section className="space-y-2.5">
          <h3 className="text-sm font-semibold text-text-primary">Property type</h3>
          <ToggleGroup
            type="multiple"
            value={filters.categories ?? []}
            onValueChange={(value) =>
              setFilters({ categories: value.length ? (value as RECategory[]) : undefined })
            }
          >
            {RE_CATEGORIES.map((c) => (
              <ToggleGroupItem key={c.key} value={c.key}>
                {c.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </section>
      )}

      {showResidentialFields ? (
        <section className="space-y-2.5">
          <h3 className="text-sm font-semibold text-text-primary">Bedrooms</h3>
          <ToggleGroup
            type="multiple"
            value={(filters.bhk ?? []).map(String)}
            onValueChange={(value) =>
              setFilters({ bhk: value.length ? value.map(Number) : undefined })
            }
          >
            {BHK_OPTIONS.map((b) => (
              <ToggleGroupItem key={b.value} value={String(b.value)}>
                {b.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Budget</h3>
          <span className="text-sm text-text-secondary">
            {formatLakhs(priceDraft[0])} - {formatLakhs(priceDraft[1])}
          </span>
        </div>
        <Slider
          value={priceDraft}
          min={PRICE_BOUNDS.min}
          max={PRICE_BOUNDS.max}
          step={1}
          onValueChange={(value) => setPriceDraft(value as [number, number])}
          onValueCommit={(value) => setFilters({ priceMin: value[0], priceMax: value[1] })}
          className="[&_[data-slot=slider-range]]:bg-brand-cta [&_[data-slot=slider-thumb]]:border-brand-cta"
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Area (sqft)</h3>
          <span className="text-sm text-text-secondary">
            {areaDraft[0].toLocaleString("en-IN")} - {areaDraft[1].toLocaleString("en-IN")} sqft
          </span>
        </div>
        <Slider
          value={areaDraft}
          min={AREA_BOUNDS.min}
          max={AREA_BOUNDS.max}
          step={50}
          onValueChange={(value) => setAreaDraft(value as [number, number])}
          onValueCommit={(value) => setFilters({ areaMin: value[0], areaMax: value[1] })}
          className="[&_[data-slot=slider-range]]:bg-brand-cta [&_[data-slot=slider-thumb]]:border-brand-cta"
        />
      </section>

      {showResidentialFields ? (
        <section className="space-y-2.5">
          <h3 className="text-sm font-semibold text-text-primary">Construction status</h3>
          <div className="flex flex-col gap-2.5">
            {STATUS_OPTIONS.map((s) => (
              <label key={s.value} className="flex cursor-pointer items-center gap-2.5">
                <Checkbox
                  checked={(filters.status ?? []).includes(s.value)}
                  onCheckedChange={() =>
                    setFilters({ status: toggleArrayValue<ListingStatus>(filters.status, s.value) })
                  }
                  className="data-[state=checked]:border-brand-cta data-[state=checked]:bg-brand-cta"
                />
                <Label className="font-normal text-text-primary">{s.label}</Label>
              </label>
            ))}
          </div>
        </section>
      ) : null}

      {showResidentialFields ? (
        <section className="space-y-2.5">
          <h3 className="text-sm font-semibold text-text-primary">Furnishing</h3>
          <ToggleGroup
            type="multiple"
            value={filters.furnishing ?? []}
            onValueChange={(value) =>
              setFilters({ furnishing: value.length ? (value as Furnishing[]) : undefined })
            }
          >
            {FURNISHING_OPTIONS.map((f) => (
              <ToggleGroupItem key={f.value} value={f.value}>
                {f.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </section>
      ) : null}

      <section className="space-y-2.5">
        <h3 className="text-sm font-semibold text-text-primary">Amenities</h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          {AMENITIES.map((a) => (
            <label key={a.value} className="flex cursor-pointer items-center gap-2.5">
              <Checkbox
                checked={(filters.amenities ?? []).includes(a.value)}
                onCheckedChange={() =>
                  setFilters({ amenities: toggleArrayValue(filters.amenities, a.value) })
                }
                className="data-[state=checked]:border-brand-cta data-[state=checked]:bg-brand-cta"
              />
              <Label className="font-normal text-text-primary">{a.label}</Label>
            </label>
          ))}
        </div>
      </section>

      {available ? (
        <section className="space-y-2.5">
          <h3 className="text-sm font-semibold text-text-primary">Current location</h3>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={locating}
            onClick={handleCurrentLocationFilter}
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
          <p id={`${locationFeedbackId}-help`} className="text-xs text-text-secondary">
            Sends an approximate position, rounded to two decimals, to
            {` ${REVERSE_GEOCODE_PROVIDER_LABEL} `}and applies only the matched city or locality to
            this search.
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
        </section>
      ) : null}

      <section className="space-y-2.5">
        <h3 className="text-sm font-semibold text-text-primary">City</h3>
        <SearchableSelect
          value={filters.city}
          onChange={(v) => {
            setLocationFeedback(null);
            setFilters({ city: v });
          }}
          options={CITIES}
          placeholder="Any city"
        />
      </section>

      <section className="space-y-2.5">
        <h3 className="text-sm font-semibold text-text-primary">Area / Locality</h3>
        <SearchableSelect
          value={filters.locality}
          onChange={(v) => {
            setLocationFeedback(null);
            setFilters({ locality: v });
          }}
          options={localityOptions}
          placeholder="Any locality"
        />
      </section>
    </div>
  );
}
