import type { components } from "@contracts/generated/schema";

type Schemas = components["schemas"];
export type PropertyCategory = Schemas["PropertyCategory"];
export type PropertySubtype = Schemas["PropertySubtype"];

export type PropertySubtypeOption = {
  value: PropertySubtype;
  label: string;
  category: PropertyCategory;
  campaignKey: string;
};

export const PROPERTY_SUBTYPE_GROUPS = [
  {
    heading: "Residential",
    items: [
      {
        value: "individual_house",
        label: "Individual houses",
        category: "houses",
        campaignKey: "individual-house",
      },
      {
        value: "standalone_apartment",
        label: "Standalone apartments",
        category: "apartments",
        campaignKey: "standalone-apartment",
      },
      {
        value: "gated_community_apartment",
        label: "Gated community apartments",
        category: "apartments",
        campaignKey: "gated-community-apartment",
      },
      { value: "villa", label: "Villas", category: "villas", campaignKey: "villa" },
    ],
  },
  {
    heading: "Plots",
    items: [
      { value: "plot", label: "Plots", category: "plots", campaignKey: "plot" },
      { value: "farmland", label: "Farmlands", category: "plots", campaignKey: "farmland" },
      { value: "agriland", label: "Agrilands", category: "plots", campaignKey: "agriland" },
    ],
  },
  {
    heading: "Commercial",
    items: [
      {
        value: "locked_space",
        label: "Locked spaces",
        category: "commercial",
        campaignKey: "locked-space",
      },
      {
        value: "unlocked_space",
        label: "Unlocked spaces",
        category: "commercial",
        campaignKey: "unlocked-space",
      },
    ],
  },
] as const satisfies readonly {
  heading: string;
  items: readonly PropertySubtypeOption[];
}[];

export const PROPERTY_SUBTYPE_OPTIONS: readonly PropertySubtypeOption[] = (
  PROPERTY_SUBTYPE_GROUPS as readonly {
    heading: string;
    items: readonly PropertySubtypeOption[];
  }[]
).flatMap((group) => group.items);

const OPTION_BY_SUBTYPE = new Map<PropertySubtype, PropertySubtypeOption>(
  PROPERTY_SUBTYPE_OPTIONS.map((option) => [option.value, option]),
);

export function propertySubtypeOption(
  value: string | null | undefined,
): PropertySubtypeOption | undefined {
  return OPTION_BY_SUBTYPE.get(value as PropertySubtype);
}

export function propertySubtypeHref(subtype: PropertySubtype): string {
  return `/real-estate?property_type=${subtype}`;
}
