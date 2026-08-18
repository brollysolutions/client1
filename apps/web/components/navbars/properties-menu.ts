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

// Purpose-drawn miniature per subtype (96x72, same real-color family as the
// /loans product art). The catalog scenes under illustrations/properties/ are
// full landscapes and unreadable at thumbnail size, so the menu gets its own
// set keyed by the taxonomy value.
const menuIllustration = (value: keyof typeof ICONS) =>
  `/illustrations/menu/properties/${value}.svg`;

export const PROPERTIES_MENU: NavColumn[] = PROPERTY_SUBTYPE_GROUPS.map((group) => ({
  groups: [
    {
      heading: group.heading,
      key: group.heading.toLowerCase(),
      items: group.items.map((item) => ({
        label: item.label,
        href: propertySubtypeHref(item.value),
        icon: ICONS[item.value],
        illustration: menuIllustration(item.value),
      })),
    },
  ],
}));

export const PROPERTIES_OVERVIEW = {
  label: "View all properties",
  href: "/real-estate",
};
