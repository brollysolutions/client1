// Pure structured-details logic shared by the "use client" property details
// dialog (components/property-details-dialog.tsx) and the server-rendered
// property detail page (components/property-detail-view.tsx). This module
// carries no "use client" directive on purpose: a Server Component can only
// invoke a function directly (not just render it as JSX) when that function
// lives outside a client-boundary file, so propertyDescription() must not be
// exported from the client dialog module even though it originated there.

import type { components } from "@contracts/generated/schema";

export type Details =
  | components["schemas"]["PropertyRead"]["structured_details"]
  | components["schemas"]["SubmissionRead"]["structured_details"]
  | undefined;

export type DetailItem = { label: string; value: string | number | null | undefined };

const LABELS: Record<string, string> = {
  east: "East",
  west: "West",
  north: "North",
  south: "South",
  not_applicable: "Not applicable",
  new_sale: "New sale",
  resale: "Resale",
  under_development: "Under development",
  completed: "Completed",
  immediate: "From day one",
  from_handover: "From handover",
  individual: "Individual",
  entity: "Business entity",
  residential: "Residential",
  residential_commercial: "Residential and commercial",
  yes: "Yes",
  no: "No",
  unknown: "Not sure",
  acres: "Acres",
  guntas: "Guntas",
  sqft: "Square feet",
  sqyd: "Square yards",
  "1_bhk": "1 BHK",
  "2_bhk": "2 BHK",
  "3_bhk": "3 BHK",
  "4_bhk": "4 BHK",
  "5_plus_bhk": "5+ BHK",
  studio: "Studio",
};

function label(value: string): string;
function label(value: string | null | undefined): string | null;
function label(value: string | null | undefined): string | null {
  // Nullable since sale_type is absent on a rent listing; a null row is dropped
  // by the renderer rather than shown as an empty "Sale type".
  if (value == null) return null;
  return LABELS[value] ?? value;
}

function money(paise: number | null | undefined) {
  return paise == null
    ? null
    : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100);
}

export function rows(details: NonNullable<Details>): DetailItem[] {
  if (details.kind === "project_residence") {
    return [
      { label: "Project name", value: details.project_name },
      { label: "Project size", value: `${details.number_of_towers} towers · ${details.total_units} units` },
      { label: "Project area", value: `${details.project_area_acres} acres` },
      { label: "Configurations", value: details.configurations.map(label).join(", ") },
      { label: "Unit or plot area", value: `${details.unit_or_plot_area_sqft.toLocaleString("en-IN")} sq ft` },
      { label: "Undivided share", value: details.uds_sqft ? `${details.uds_sqft.toLocaleString("en-IN")} sq ft` : null },
      { label: "Price per sq ft", value: money(details.price_per_sqft_paise) },
      { label: "Sale type", value: label(details.sale_type) },
      { label: "Expected handover", value: details.expected_handover_date },
      { label: "Plot facing", value: label(details.plot_facing) },
      { label: "Entrance facing", value: label(details.entrance_facing) },
      { label: "Local approval", value: details.local_approval ? `${details.local_approval.authority}${details.local_approval.reference_number ? ` · ${details.local_approval.reference_number}` : ""}` : null },
      { label: "Amenities", value: details.amenities_description },
      { label: "About the project", value: details.about_project },
    ];
  }
  if (details.kind === "individual_property") {
    return [
      { label: "Property use", value: label(details.property_use) },
      { label: "Total land area", value: `${details.total_land_area.toLocaleString("en-IN")} ${label(details.land_area_unit)}` },
      { label: "Built-up area", value: `${details.built_up_area_sqft.toLocaleString("en-IN")} sq ft` },
      { label: "Floors", value: details.number_of_floors },
      { label: "Facing", value: label(details.facing) },
      { label: "Monthly rental income", value: money(details.monthly_rental_income_paise) },
      { label: "Ongoing loan", value: label(details.ongoing_loan_status) },
      { label: "About the property", value: details.about_property },
      { label: "Additional information", value: details.other_information },
    ];
  }
  if (details.kind === "commercial_property") {
    return [
      { label: "Ownership", value: label(details.ownership_type) },
      { label: "Total area", value: `${details.total_area_sqft.toLocaleString("en-IN")} sq ft` },
      { label: "Unit area", value: `${details.unit_area_sqft.toLocaleString("en-IN")} sq ft` },
      { label: "Facing", value: label(details.facing) },
      { label: "Sale type", value: label(details.sale_type) },
      { label: "Rental income starts", value: label(details.rental_income_start) },
      { label: "Monthly rental income", value: money(details.monthly_rental_income_paise) },
      { label: "Local approval", value: details.local_approval ? `${details.local_approval.authority}${details.local_approval.reference_number ? ` · ${details.local_approval.reference_number}` : ""}` : null },
      { label: "Amenities", value: details.amenities_description },
      { label: "About the property", value: details.about_property },
      { label: "Additional information", value: details.other_information },
    ];
  }
  if (details.kind === "plot") {
    return [
      { label: "Project name", value: details.project_name },
      { label: "Project area", value: `${details.total_project_area_acres} acres` },
      { label: "Plot size", value: `${details.plot_size_sqyd.toLocaleString("en-IN")} sq yd` },
      { label: "Total plots", value: details.total_plots },
      { label: "Facing", value: label(details.facing) },
      { label: "Price per sq yd", value: money(details.price_per_sqyd_paise) },
      { label: "Sale type", value: label(details.sale_type) },
      { label: "Project status", value: label(details.project_status) },
      { label: "Local approval", value: details.local_approval ? `${details.local_approval.authority}${details.local_approval.reference_number ? ` · ${details.local_approval.reference_number}` : ""}` : null },
      { label: "Amenities", value: details.amenities_description },
      { label: "About the project", value: details.about_project },
      { label: "Additional information", value: details.other_information },
    ];
  }
  return [
    { label: "Land area", value: `${details.land_area.toLocaleString("en-IN")} ${label(details.land_area_unit)}` },
    { label: "Land title", value: details.title_details },
    { label: "Facilities", value: details.facilities?.join(", ") },
    { label: "Ongoing loan", value: label(details.ongoing_loan_status) },
    { label: "Land type", value: details.land_type },
    { label: "Survey number", value: details.survey_number },
    { label: "Rythu Bandhu", value: label(details.rythu_bandhu_status) },
    { label: "Registration district", value: details.registration_district },
    { label: "Sub-Registrar Office", value: details.sub_registrar_office },
    { label: "Additional information", value: details.other_information },
  ];
}

// The free-text "About the project"/"About the property" narrative, lifted
// out for the detail page's own Description section (see
// components/property-description.tsx). Only project_residence and plot carry
// a project narrative; only individual_property and commercial_property carry
// a property narrative; agricultural_land has no equivalent field.
export function propertyDescription(details: Details): string | null {
  if (!details) return null;
  if (details.kind === "project_residence" || details.kind === "plot") {
    return details.about_project ?? null;
  }
  if (details.kind === "individual_property" || details.kind === "commercial_property") {
    return details.about_property ?? null;
  }
  return null;
}

export const DESCRIPTION_LABELS = new Set(["About the project", "About the property"]);
