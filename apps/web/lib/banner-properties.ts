import type { components } from "@contracts/generated/schema";

import { contactHref } from "@/lib/leads";

type Schemas = components["schemas"];
type Property = Schemas["PropertyRead"];
type Template = Schemas["BannerTemplateRead"];

const PROPERTY_CATEGORY_BY_TEMPLATE: Readonly<
  Partial<Record<Template["category_key"], Property["category"]>>
> = {
  apartments: "apartments",
  houses: "houses",
  villas: "villas",
  "plots-land": "plots",
  commercial: "commercial",
};

export function isLegacyPropertyCampaignTemplate(
  template: Pick<Template, "placement" | "category_key">,
): boolean {
  return (
    template.placement === "properties" &&
    PROPERTY_CATEGORY_BY_TEMPLATE[template.category_key] !== undefined
  );
}

const PROPERTY_SUBTYPE_BY_TEMPLATE: Readonly<
  Partial<Record<Template["category_key"], NonNullable<Property["property_subtype"]>>>
> = {
  "individual-house": "individual_house",
  "standalone-apartment": "standalone_apartment",
  "gated-community-apartment": "gated_community_apartment",
  villa: "villa",
  "locked-space": "locked_space",
  "unlocked-space": "unlocked_space",
  plot: "plot",
  farmland: "farmland",
  agriland: "agriland",
};

export function isPropertyCampaignTemplate(
  template: Pick<Template, "placement" | "category_key"> | undefined,
): boolean {
  if (!template) return false;
  if (template.placement === "homepage") return template.category_key === "properties";
  return (
    template.placement === "properties" &&
    (PROPERTY_CATEGORY_BY_TEMPLATE[template.category_key] !== undefined ||
      PROPERTY_SUBTYPE_BY_TEMPLATE[template.category_key] !== undefined)
  );
}

export function propertyMatchesCampaign(
  property: Pick<Property, "active" | "category" | "property_subtype">,
  template: Pick<Template, "placement" | "category_key">,
): boolean {
  if (!property.active || !isPropertyCampaignTemplate(template)) return false;
  if (template.placement === "homepage") return true;
  const expectedSubtype = PROPERTY_SUBTYPE_BY_TEMPLATE[template.category_key];
  if (expectedSubtype) return property.property_subtype === expectedSubtype;
  return PROPERTY_CATEGORY_BY_TEMPLATE[template.category_key] === property.category;
}

export function propertyCampaignProduct(
  property: Pick<Property, "title" | "location">,
): string {
  return `${property.title}, ${property.location}`.slice(0, 120);
}

export function propertyCampaignHref(
  property: Pick<Property, "title" | "location">,
): string {
  return contactHref({
    line: "real_estate",
    product: propertyCampaignProduct(property),
  });
}

export function propertyCampaignImage(
  property: Pick<Property, "media_urls"> | undefined,
  template?: Pick<Template, "placement" | "image_url">,
): string | undefined {
  if (template?.placement === "properties") return template.image_url;
  return property?.media_urls?.[0] ?? undefined;
}
