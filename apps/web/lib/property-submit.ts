import type { components } from "@contracts/generated/schema";

import { propertySubtypeOption } from "@/lib/property-taxonomy";

type Schemas = components["schemas"];
type SubmissionCreate = Schemas["SubmissionCreate"];
type SubmissionUpdate = Schemas["SubmissionUpdate"];
type SubmissionRead = Schemas["SubmissionRead"];
type Furnishing = Schemas["Furnishing"];
type ConstructionStatus = Schemas["ConstructionStatus"];
type SubmissionMediaInput = Schemas["SubmissionMediaInput"];
type PropertySubtype = Schemas["PropertySubtype"];
type ReraApplicability = Schemas["ReraApplicability"];
type StructuredDetails = SubmissionCreate["structured_details"];

export const FURNISHING_OPTIONS = [
  { value: "unfurnished", label: "Not furnished" },
  { value: "semi", label: "Semi-furnished" },
  { value: "furnished", label: "Fully furnished" },
] as const satisfies readonly { value: Furnishing; label: string }[];

export const CONSTRUCTION_OPTIONS = [
  { value: "under_construction", label: "Under construction" },
  { value: "ready", label: "Ready to move" },
] as const satisfies readonly { value: ConstructionStatus; label: string }[];

export const FACING_OPTIONS = [
  { value: "east", label: "East" },
  { value: "west", label: "West" },
  { value: "north", label: "North" },
  { value: "south", label: "South" },
  { value: "not_applicable", label: "Not applicable" },
] as const;

export const YES_NO_UNKNOWN_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unknown", label: "Not sure" },
] as const;

export const CONFIGURATION_OPTIONS = [
  { value: "1_bhk", label: "1 BHK" },
  { value: "2_bhk", label: "2 BHK" },
  { value: "3_bhk", label: "3 BHK" },
  { value: "4_bhk", label: "4 BHK" },
  { value: "5_plus_bhk", label: "5+ BHK" },
  { value: "studio", label: "Studio" },
] as const;

export type PropertyDetailForm = {
  projectName: string;
  projectAreaAcres: string;
  numberOfTowers: string;
  totalUnits: string;
  configurations: string[];
  unitAreaSqft: string;
  udsSqft: string;
  rateRupees: string;
  saleType: string;
  expectedHandoverDate: string;
  plotFacing: string;
  facing: string;
  approvalAuthority: string;
  approvalReference: string;
  amenitiesDescription: string;
  about: string;
  otherInformation: string;
  propertyUse: string;
  totalLandArea: string;
  landAreaUnit: string;
  numberOfFloors: string;
  monthlyRentalIncomeRupees: string;
  ongoingLoanStatus: string;
  ownershipType: string;
  totalAreaSqft: string;
  rentalIncomeStart: string;
  totalProjectAreaAcres: string;
  plotSizeSqyd: string;
  totalPlots: string;
  projectStatus: string;
  landArea: string;
  agriculturalAreaUnit: string;
  titleDetails: string;
  landType: string;
  surveyNumber: string;
  rythuBandhuStatus: string;
  registrationDistrict: string;
  subRegistrarOffice: string;
};

export const EMPTY_DETAILS: PropertyDetailForm = {
  projectName: "",
  projectAreaAcres: "",
  numberOfTowers: "",
  totalUnits: "",
  configurations: [],
  unitAreaSqft: "",
  udsSqft: "",
  rateRupees: "",
  saleType: "",
  expectedHandoverDate: "",
  plotFacing: "not_applicable",
  facing: "",
  approvalAuthority: "",
  approvalReference: "",
  amenitiesDescription: "",
  about: "",
  otherInformation: "",
  propertyUse: "",
  totalLandArea: "",
  landAreaUnit: "",
  numberOfFloors: "",
  monthlyRentalIncomeRupees: "",
  ongoingLoanStatus: "",
  ownershipType: "",
  totalAreaSqft: "",
  rentalIncomeStart: "",
  totalProjectAreaAcres: "",
  plotSizeSqyd: "",
  totalPlots: "",
  projectStatus: "",
  landArea: "",
  agriculturalAreaUnit: "",
  titleDetails: "",
  landType: "",
  surveyNumber: "",
  rythuBandhuStatus: "",
  registrationDistrict: "",
  subRegistrarOffice: "",
};

export type SubmitFormState = {
  title: string;
  type: string;
  location: string;
  meta: string;
  images: File[];
  documents: File[];
  panorama: File | null;
  propertySubtype: PropertySubtype | "";
  city: string;
  locality: string;
  state: string;
  pincode: string;
  priceRupees: string;
  furnishing: Furnishing | "";
  constructionStatus: ConstructionStatus | "";
  amenities: string[];
  reraApplicability: ReraApplicability | "";
  reraNumber: string;
  details: PropertyDetailForm;
};

export const EMPTY_FORM: SubmitFormState = {
  title: "",
  type: "",
  location: "",
  meta: "",
  images: [],
  documents: [],
  panorama: null,
  propertySubtype: "",
  city: "",
  locality: "",
  state: "",
  pincode: "",
  priceRupees: "",
  furnishing: "",
  constructionStatus: "",
  amenities: [],
  reraApplicability: "",
  reraNumber: "",
  details: EMPTY_DETAILS,
};

const PROJECT_SUBTYPES = new Set<PropertySubtype>([
  "standalone_apartment",
  "gated_community_apartment",
  "villa",
]);
const COMMERCIAL_SUBTYPES = new Set<PropertySubtype>(["locked_space", "unlocked_space"]);
const AGRICULTURAL_SUBTYPES = new Set<PropertySubtype>(["farmland", "agriland"]);

export function propertyFormFamily(subtype: PropertySubtype | "") {
  if (!subtype) return null;
  if (PROJECT_SUBTYPES.has(subtype)) return "project" as const;
  if (subtype === "individual_house") return "individual" as const;
  if (COMMERCIAL_SUBTYPES.has(subtype)) return "commercial" as const;
  if (subtype === "plot") return "plot" as const;
  if (AGRICULTURAL_SUBTYPES.has(subtype)) return "agricultural" as const;
  return null;
}

function toInt(value: string): number {
  const number = Number.parseInt(value.trim(), 10);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function toNumber(value: string): number {
  const number = Number.parseFloat(value.trim());
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function toPaise(value: string): number {
  return Math.round(toNumber(value) * 100);
}

function optionalPaise(value: string): number | null {
  return value.trim() ? toPaise(value) : null;
}

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function localApproval(details: PropertyDetailForm) {
  return details.approvalAuthority.trim()
    ? {
        authority: details.approvalAuthority.trim(),
        reference_number: orNull(details.approvalReference),
      }
    : null;
}

function buildStructuredDetails(form: SubmitFormState): StructuredDetails {
  const details = form.details;
  switch (propertyFormFamily(form.propertySubtype)) {
    case "project":
      return {
        kind: "project_residence",
        project_name: details.projectName.trim(),
        project_area_acres: toNumber(details.projectAreaAcres),
        number_of_towers: toInt(details.numberOfTowers),
        total_units: toInt(details.totalUnits),
        configurations: details.configurations as Schemas["ResidentialConfiguration"][],
        unit_or_plot_area_sqft: toInt(details.unitAreaSqft),
        uds_sqft: details.udsSqft.trim() ? toInt(details.udsSqft) : null,
        price_per_sqft_paise: toPaise(details.rateRupees),
        sale_type: details.saleType as Schemas["SaleType"],
        expected_handover_date: orNull(details.expectedHandoverDate),
        plot_facing: details.plotFacing as Schemas["Facing"],
        entrance_facing: details.facing as Schemas["Facing"],
        local_approval: localApproval(details),
        amenities_description: details.amenitiesDescription.trim(),
        about_project: details.about.trim(),
      };
    case "individual":
      return {
        kind: "individual_property",
        property_use: details.propertyUse as Schemas["PropertyUse"],
        total_land_area: toNumber(details.totalLandArea),
        land_area_unit: details.landAreaUnit as Schemas["SiteAreaUnit"],
        built_up_area_sqft: toInt(details.unitAreaSqft),
        number_of_floors: toInt(details.numberOfFloors),
        facing: details.facing as Schemas["Facing"],
        monthly_rental_income_paise: optionalPaise(details.monthlyRentalIncomeRupees),
        ongoing_loan_status: details.ongoingLoanStatus as Schemas["YesNoUnknown"],
        about_property: details.about.trim(),
        other_information: orNull(details.otherInformation),
      };
    case "commercial":
      return {
        kind: "commercial_property",
        ownership_type: details.ownershipType as Schemas["CommercialOwnership"],
        total_area_sqft: toInt(details.totalAreaSqft),
        unit_area_sqft: toInt(details.unitAreaSqft),
        facing: details.facing as Schemas["Facing"],
        sale_type: details.saleType as Schemas["SaleType"],
        rental_income_start: details.rentalIncomeStart as Schemas["RentalIncomeStart"],
        monthly_rental_income_paise: optionalPaise(details.monthlyRentalIncomeRupees),
        local_approval: localApproval(details),
        amenities_description: orNull(details.amenitiesDescription),
        about_property: details.about.trim(),
        other_information: orNull(details.otherInformation),
      };
    case "plot":
      return {
        kind: "plot",
        project_name: details.projectName.trim(),
        local_approval: localApproval(details),
        total_project_area_acres: toNumber(details.totalProjectAreaAcres),
        plot_size_sqyd: toInt(details.plotSizeSqyd),
        total_plots: toInt(details.totalPlots),
        facing: details.facing as Schemas["Facing"],
        price_per_sqyd_paise: toPaise(details.rateRupees),
        sale_type: details.saleType as Schemas["SaleType"],
        project_status: details.projectStatus as Schemas["PlotProjectStatus"],
        amenities_description: orNull(details.amenitiesDescription),
        about_project: details.about.trim(),
        other_information: orNull(details.otherInformation),
      };
    case "agricultural":
      return {
        kind: "agricultural_land",
        land_area: toNumber(details.landArea),
        land_area_unit: details.agriculturalAreaUnit as Schemas["LandAreaUnit"],
        title_details: details.titleDetails.trim(),
        facilities: form.amenities,
        ongoing_loan_status: details.ongoingLoanStatus as Schemas["YesNoUnknown"],
        land_type: details.landType.trim(),
        survey_number: details.surveyNumber.trim(),
        rythu_bandhu_status: details.rythuBandhuStatus as Schemas["YesNoUnknown"],
        registration_district: details.registrationDistrict.trim(),
        sub_registrar_office: details.subRegistrarOffice.trim(),
        other_information: orNull(details.otherInformation),
      };
    default:
      throw new Error("A valid property subtype is required.");
  }
}

export function buildSubmissionPayload(
  form: SubmitFormState,
  media: SubmissionMediaInput[],
): SubmissionCreate {
  return { ...buildSubmissionUpdatePayload(form), media };
}

export function buildSubmissionUpdatePayload(form: SubmitFormState): SubmissionUpdate {
  const subtype = propertySubtypeOption(form.propertySubtype);
  if (!subtype) throw new Error("A valid property subtype is required.");
  const family = propertyFormFamily(form.propertySubtype);
  const areaSqft =
    family === "plot"
      ? toInt(form.details.plotSizeSqyd) * 9
      : family === "agricultural"
        ? 0
        : toInt(form.details.unitAreaSqft);
  return {
    title: form.title.trim(),
    type: form.type.trim(),
    location: form.location.trim(),
    meta: orNull(form.meta),
    category: subtype.category,
    property_subtype: subtype.value,
    city: form.city.trim(),
    locality: form.locality.trim(),
    state: form.state.trim(),
    pincode: form.pincode.trim(),
    price_paise: toPaise(form.priceRupees),
    bhk: 0,
    area_sqft: areaSqft,
    furnishing:
      family === "project" || family === "commercial" ? (form.furnishing || null) : null,
    construction_status:
      family === "project" || family === "commercial"
        ? (form.constructionStatus || null)
        : null,
    amenities: form.amenities,
    age_years: 0,
    rera_applicability: form.reraApplicability as ReraApplicability,
    rera_number: orNull(form.reraNumber),
    structured_details: buildStructuredDetails(form),
  };
}

function detailsFromSubmission(submission: SubmissionRead): PropertyDetailForm {
  const form = { ...EMPTY_DETAILS, configurations: [] };
  const details = submission.structured_details;
  if (!details) return form;
  const setApproval = (approval?: Schemas["LocalApproval"] | null) => {
    form.approvalAuthority = approval?.authority ?? "";
    form.approvalReference = approval?.reference_number ?? "";
  };
  if (details.kind === "project_residence") {
    Object.assign(form, {
      projectName: details.project_name,
      projectAreaAcres: String(details.project_area_acres),
      numberOfTowers: String(details.number_of_towers),
      totalUnits: String(details.total_units),
      configurations: [...details.configurations],
      unitAreaSqft: String(details.unit_or_plot_area_sqft),
      udsSqft: details.uds_sqft == null ? "" : String(details.uds_sqft),
      rateRupees: String(details.price_per_sqft_paise / 100),
      saleType: details.sale_type,
      expectedHandoverDate: details.expected_handover_date ?? "",
      plotFacing: details.plot_facing,
      facing: details.entrance_facing,
      amenitiesDescription: details.amenities_description ?? "",
      about: details.about_project,
    });
    setApproval(details.local_approval);
  } else if (details.kind === "individual_property") {
    Object.assign(form, {
      propertyUse: details.property_use,
      totalLandArea: String(details.total_land_area),
      landAreaUnit: details.land_area_unit,
      unitAreaSqft: String(details.built_up_area_sqft),
      numberOfFloors: String(details.number_of_floors),
      facing: details.facing,
      monthlyRentalIncomeRupees:
        details.monthly_rental_income_paise == null
          ? ""
          : String(details.monthly_rental_income_paise / 100),
      ongoingLoanStatus: details.ongoing_loan_status,
      about: details.about_property,
      otherInformation: details.other_information ?? "",
    });
  } else if (details.kind === "commercial_property") {
    Object.assign(form, {
      ownershipType: details.ownership_type,
      totalAreaSqft: String(details.total_area_sqft),
      unitAreaSqft: String(details.unit_area_sqft),
      facing: details.facing,
      saleType: details.sale_type,
      rentalIncomeStart: details.rental_income_start,
      monthlyRentalIncomeRupees:
        details.monthly_rental_income_paise == null
          ? ""
          : String(details.monthly_rental_income_paise / 100),
      amenitiesDescription: details.amenities_description ?? "",
      about: details.about_property,
      otherInformation: details.other_information ?? "",
    });
    setApproval(details.local_approval);
  } else if (details.kind === "plot") {
    Object.assign(form, {
      projectName: details.project_name,
      totalProjectAreaAcres: String(details.total_project_area_acres),
      plotSizeSqyd: String(details.plot_size_sqyd),
      totalPlots: String(details.total_plots),
      facing: details.facing,
      rateRupees: String(details.price_per_sqyd_paise / 100),
      saleType: details.sale_type,
      projectStatus: details.project_status,
      amenitiesDescription: details.amenities_description ?? "",
      about: details.about_project,
      otherInformation: details.other_information ?? "",
    });
    setApproval(details.local_approval);
  } else {
    Object.assign(form, {
      landArea: String(details.land_area),
      agriculturalAreaUnit: details.land_area_unit,
      titleDetails: details.title_details,
      ongoingLoanStatus: details.ongoing_loan_status,
      landType: details.land_type,
      surveyNumber: details.survey_number,
      rythuBandhuStatus: details.rythu_bandhu_status,
      registrationDistrict: details.registration_district,
      subRegistrarOffice: details.sub_registrar_office,
      otherInformation: details.other_information ?? "",
    });
  }
  return form;
}

export function submissionToFormState(submission: SubmissionRead): SubmitFormState {
  return {
    title: submission.title,
    type: submission.type,
    location: submission.location,
    meta: submission.meta ?? "",
    images: [],
    documents: [],
    panorama: null,
    propertySubtype: submission.property_subtype ?? "",
    city: submission.city,
    locality: submission.locality,
    state: submission.state ?? "",
    pincode: submission.pincode,
    priceRupees: String(submission.price_paise / 100),
    furnishing: submission.furnishing ?? "",
    constructionStatus: submission.construction_status ?? "",
    amenities: [...submission.amenities],
    reraApplicability: submission.rera_applicability,
    reraNumber: submission.rera_number ?? "",
    details: detailsFromSubmission(submission),
  };
}

const UNSAFE_NARRATIVE = /\p{Nd}|[a-z][a-z0-9+.-]*:\/\/|www\.|\b(?:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.)+[a-z]{2,63}\b|<[^>]+>|\[[^\]]+\]\([^)]+\)|\S+@\S+/iu;

function requireValue(errors: Record<string, string>, key: string, value: string, label: string) {
  if (!value.trim()) errors[key] = `${label} is required.`;
}

function requirePositive(errors: Record<string, string>, key: string, value: string, label: string) {
  if (toNumber(value) <= 0) errors[key] = `Enter a valid ${label.toLowerCase()}.`;
}

function validateNarrative(
  errors: Record<string, string>,
  key: string,
  value: string,
  label: string,
  maxWords: number,
  minWords = 0,
) {
  const trimmed = value.trim();
  if (!trimmed) return;
  if (UNSAFE_NARRATIVE.test(trimmed)) {
    errors[key] = `${label} cannot contain numbers, links, email addresses, or markup.`;
  } else if (trimmed.split(/\s+/).length < minWords) {
    errors[key] = `${label} must be at least ${minWords} words.`;
  } else if (trimmed.split(/\s+/).length > maxWords) {
    errors[key] = `${label} must be ${maxWords} words or fewer.`;
  }
}

export function validateForm(
  form: SubmitFormState,
  { requireImages = true }: { requireImages?: boolean } = {},
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [key, value, label] of [
    ["title", form.title, "Listing name"],
    ["type", form.type, "Display type"],
    ["location", form.location, "Display location"],
    ["city", form.city, "City"],
    ["locality", form.locality, "Locality"],
    ["state", form.state, "State"],
    ["propertySubtype", form.propertySubtype, "Property type"],
    ["reraApplicability", form.reraApplicability, "RERA applicability"],
  ] as const) requireValue(errors, key, value, label);
  if (!/^[1-9]\d{5}$/.test(form.pincode.trim())) errors.pincode = "Enter a valid 6-digit pincode.";
  requirePositive(errors, "priceRupees", form.priceRupees, "property price");

  const details = form.details;
  const family = propertyFormFamily(form.propertySubtype);
  if (family === "project") {
    requireValue(errors, "projectName", details.projectName, "Project name");
    requirePositive(errors, "projectAreaAcres", details.projectAreaAcres, "project area");
    requirePositive(errors, "numberOfTowers", details.numberOfTowers, "number of towers");
    requirePositive(errors, "totalUnits", details.totalUnits, "total units");
    if (details.configurations.length === 0) errors.configurations = "Choose a configuration.";
    requirePositive(errors, "unitAreaSqft", details.unitAreaSqft, "unit or plot area");
    requirePositive(errors, "rateRupees", details.rateRupees, "price per square foot");
    requireValue(errors, "saleType", details.saleType, "Sale type");
    requireValue(errors, "facing", details.facing, "Entrance facing");
    requireValue(errors, "about", details.about, "About the project");
    requireValue(errors, "amenitiesDescription", details.amenitiesDescription, "Amenities description");
    requireValue(errors, "furnishing", form.furnishing, "Furnishing");
    requireValue(errors, "constructionStatus", form.constructionStatus, "Construction status");
    if (form.constructionStatus === "under_construction") {
      requireValue(errors, "expectedHandoverDate", details.expectedHandoverDate, "Expected handover date");
    }
    validateNarrative(errors, "about", details.about, "About the project", 500);
    validateNarrative(
      errors,
      "amenitiesDescription",
      details.amenitiesDescription,
      "Amenities description",
      500,
      150,
    );
  } else if (family === "individual") {
    requireValue(errors, "propertyUse", details.propertyUse, "Property use");
    requirePositive(errors, "totalLandArea", details.totalLandArea, "total land area");
    requireValue(errors, "landAreaUnit", details.landAreaUnit, "Land area unit");
    requirePositive(errors, "unitAreaSqft", details.unitAreaSqft, "built-up area");
    requirePositive(errors, "numberOfFloors", details.numberOfFloors, "number of floors");
    requireValue(errors, "facing", details.facing, "Facing");
    requireValue(errors, "ongoingLoanStatus", details.ongoingLoanStatus, "Ongoing loan status");
    requireValue(errors, "about", details.about, "About the property");
    validateNarrative(errors, "about", details.about, "About the property", 250);
  } else if (family === "commercial") {
    requireValue(errors, "ownershipType", details.ownershipType, "Ownership type");
    requirePositive(errors, "totalAreaSqft", details.totalAreaSqft, "total area");
    requirePositive(errors, "unitAreaSqft", details.unitAreaSqft, "unit area");
    requireValue(errors, "facing", details.facing, "Facing");
    requireValue(errors, "saleType", details.saleType, "Sale type");
    requireValue(errors, "rentalIncomeStart", details.rentalIncomeStart, "Income start");
    requireValue(errors, "about", details.about, "About the property");
    requireValue(errors, "furnishing", form.furnishing, "Furnishing");
    requireValue(errors, "constructionStatus", form.constructionStatus, "Construction status");
    validateNarrative(errors, "about", details.about, "About the property", 250);
  } else if (family === "plot") {
    requireValue(errors, "projectName", details.projectName, "Project name");
    requirePositive(errors, "totalProjectAreaAcres", details.totalProjectAreaAcres, "project area");
    requirePositive(errors, "plotSizeSqyd", details.plotSizeSqyd, "plot size");
    requirePositive(errors, "totalPlots", details.totalPlots, "total plots");
    requireValue(errors, "facing", details.facing, "Facing");
    requirePositive(errors, "rateRupees", details.rateRupees, "price per square yard");
    requireValue(errors, "saleType", details.saleType, "Sale type");
    requireValue(errors, "projectStatus", details.projectStatus, "Project status");
    requireValue(errors, "about", details.about, "About the project");
    validateNarrative(errors, "about", details.about, "About the project", 500);
  } else if (family === "agricultural") {
    requirePositive(errors, "landArea", details.landArea, "land area");
    requireValue(errors, "agriculturalAreaUnit", details.agriculturalAreaUnit, "Land area unit");
    requireValue(errors, "titleDetails", details.titleDetails, "Title details");
    requireValue(errors, "ongoingLoanStatus", details.ongoingLoanStatus, "Ongoing loan status");
    requireValue(errors, "landType", details.landType, "Land type");
    requireValue(errors, "surveyNumber", details.surveyNumber, "Survey number");
    requireValue(errors, "rythuBandhuStatus", details.rythuBandhuStatus, "Rythu Bandhu status");
    requireValue(errors, "registrationDistrict", details.registrationDistrict, "Registration district");
    requireValue(errors, "subRegistrarOffice", details.subRegistrarOffice, "Sub-Registrar Office");
  }
  if (family !== "project") {
    validateNarrative(errors, "amenitiesDescription", details.amenitiesDescription, "Amenities description", 150);
  }
  validateNarrative(errors, "otherInformation", details.otherInformation, "Additional information", 250);

  if ((requireImages && form.images.length < 1) || form.images.length > 10) {
    errors.images = "Choose between 1 and 10 property images.";
  }
  if (form.documents.length > 2) errors.documents = "Choose at most 2 PDF documents.";
  const maxBytes = 5 * 1024 * 1024;
  const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (form.images.some((file) => !imageTypes.has(file.type))) {
    errors.images = "Images must be JPEG, PNG, or WebP.";
  } else if (form.images.some((file) => file.size > maxBytes)) {
    errors.images = "Each image must be 5 MiB or smaller.";
  }
  if (form.documents.some((file) => file.type !== "application/pdf")) {
    errors.documents = "Reviewer documents must be PDFs.";
  } else if (form.documents.some((file) => file.size > maxBytes)) {
    errors.documents = "Each PDF must be 5 MiB or smaller.";
  }
  if (form.panorama) {
    if (!new Set(["image/jpeg", "image/webp"]).has(form.panorama.type)) {
      errors.panorama = "The 360 panorama must be a JPEG or WebP image.";
    } else if (form.panorama.size > maxBytes) {
      errors.panorama = "The 360 panorama must be 5 MiB or smaller.";
    } else if (form.panorama.size < 1) {
      errors.panorama = "The 360 panorama is empty.";
    }
  }
  return errors;
}
