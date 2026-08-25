// Which filter facets are meaningful for which property categories.
//
// This replaces the residential-vs-everything-else boolean the filter sheet
// used to carry. The applicability below mirrors what each category's listing
// form actually collects (apps/api/app/schemas/property_details.py): a plot has
// no bedroom count, furnishing state, or construction status; a commercial unit
// has furnishing and fit-out status but still no bedrooms.
//
// Pure data and derivations over the contract-derived unions, kept out of the
// component so it is directly unit-testable under the `node` Vitest env.

import { PROPERTY_SUBTYPE_GROUPS } from "@/lib/property-taxonomy";
import type { RECategory, RESubtype } from "@/lib/real-estate";

export type FacetKey =
  | "subtype"
  | "bhk"
  | "price"
  | "area"
  | "status"
  | "furnishing"
  | "amenities";

const ALL_FACETS: readonly FacetKey[] = [
  "subtype",
  "bhk",
  "price",
  "area",
  "status",
  "furnishing",
  "amenities",
];

const RESIDENTIAL_FACETS: readonly FacetKey[] = [
  "subtype",
  "bhk",
  "price",
  "area",
  "status",
  "furnishing",
  "amenities",
];

const FACETS_BY_CATEGORY: Record<RECategory, readonly FacetKey[]> = {
  houses: RESIDENTIAL_FACETS,
  apartments: RESIDENTIAL_FACETS,
  villas: RESIDENTIAL_FACETS,
  // Land is sold by extent and location. Bedrooms, furnishing, and
  // construction status have no value to set.
  plots: ["subtype", "price", "area", "amenities"],
  // Commercial space has no bedroom count, but fit-out state and handover
  // status are exactly what a buyer screens on.
  commercial: ["subtype", "price", "area", "status", "furnishing", "amenities"],
};

const CATEGORY_BY_SUBTYPE = new Map<RESubtype, RECategory>(
  PROPERTY_SUBTYPE_GROUPS.flatMap((group) =>
    group.items.map((item) => [item.value, item.category] as const),
  ),
);

export function categoryForSubtype(subtype: RESubtype): RECategory | undefined {
  return CATEGORY_BY_SUBTYPE.get(subtype);
}

// Categories whose subtype genuinely subdivides them. `houses` and `villas`
// each have exactly one subtype, so offering it would put two controls reading
// "Villas" in the same panel that return different counts (the subtype excludes
// listings that predate the taxonomy). Those categories are already expressible
// through the Property type facet, so only the categories that actually branch
// get a subtype control.
const SUBDIVIDED_CATEGORIES: ReadonlySet<RECategory> = (() => {
  const counts = new Map<RECategory, number>();
  for (const [, category] of CATEGORY_BY_SUBTYPE) {
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const subdivided = new Set<RECategory>();
  for (const [category, count] of counts) {
    if (count > 1) subdivided.add(category);
  }
  return subdivided;
})();

// The categories a selection is really scoped to: explicit category picks plus
// the categories implied by any picked subtype. Empty means "no constraint".
function effectiveCategories(
  categories: RECategory[] | undefined,
  subtypes: RESubtype[] | undefined,
): RECategory[] {
  const scoped = new Set<RECategory>(categories ?? []);
  for (const subtype of subtypes ?? []) {
    const category = categoryForSubtype(subtype);
    if (category) scoped.add(category);
  }
  return Array.from(scoped);
}

// Facets to render for the current selection. With nothing selected every facet
// is available. With several selected we take the union, never the
// intersection: hiding a facet that one of the chosen categories supports would
// silently drop a constraint the user can legitimately express.
export function visibleFacets(
  categories?: RECategory[],
  subtypes?: RESubtype[],
): Set<FacetKey> {
  const scoped = effectiveCategories(categories, subtypes);
  if (scoped.length === 0) return new Set(ALL_FACETS);

  const visible = new Set<FacetKey>();
  for (const category of scoped) {
    for (const facet of FACETS_BY_CATEGORY[category]) visible.add(facet);
  }
  return visible;
}

export function isFacetVisible(
  facet: FacetKey,
  categories?: RECategory[],
  subtypes?: RESubtype[],
): boolean {
  return visibleFacets(categories, subtypes).has(facet);
}

export type SubtypeGroup = {
  heading: string;
  items: { value: RESubtype; label: string; category: RECategory }[];
};

// Subtype options narrowed to the selected categories and to the subtypes that
// exist in the current result ceiling. Groups that end up empty are dropped so
// the sheet never shows a heading with nothing under it.
export function subtypeGroupsFor(
  categories?: RECategory[],
  available?: readonly RESubtype[],
): SubtypeGroup[] {
  const availableSet = available ? new Set(available) : null;
  const groups: SubtypeGroup[] = [];

  for (const group of PROPERTY_SUBTYPE_GROUPS) {
    const items = group.items.filter((item) => {
      if (!SUBDIVIDED_CATEGORIES.has(item.category)) return false;
      if (categories?.length && !categories.includes(item.category)) return false;
      if (availableSet && !availableSet.has(item.value)) return false;
      return true;
    });
    if (items.length > 0) {
      groups.push({
        heading: group.heading,
        items: items.map((item) => ({
          value: item.value,
          label: item.label,
          category: item.category,
        })),
      });
    }
  }

  return groups;
}
