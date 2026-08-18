import { Building2, House, Lock, Map, Shield, Sprout, Unlock, Warehouse, Wheat } from "lucide-react";

import type { NavColumn } from "@/components/navbars/nav-items";
import { PROPERTY_SUBTYPE_GROUPS, propertySubtypeHref } from "@/lib/property-taxonomy";

const ICONS = {
  individual_house: House,
  standalone_apartment: Building2,
  gated_community_apartment: Shield,
  villa: Warehouse,
  locked_space: Lock,
  unlocked_space: Unlock,
  plot: Map,
  farmland: Sprout,
  agriland: Wheat,
} as const;

export const PROPERTIES_MENU: NavColumn[] = PROPERTY_SUBTYPE_GROUPS.map((group) => ({
  groups: [
    {
      heading: group.heading,
      key: group.heading.toLowerCase(),
      items: group.items.map((item) => ({
        label: item.label,
        href: propertySubtypeHref(item.value),
        icon: ICONS[item.value],
      })),
    },
  ],
}));

export const PROPERTIES_OVERVIEW = {
  label: "View all properties",
  href: "/real-estate",
};
