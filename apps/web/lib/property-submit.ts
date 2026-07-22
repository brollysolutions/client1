// Pure form-state -> SubmissionCreate builder + contract-pinned option lists for
// the agent property-submit form. Kept separate from the component so the ₹->paise
// conversion and validation are unit-tested (the one place a bug corrupts catalog data).
import type { components } from "@contracts/generated/schema";

type Schemas = components["schemas"];
type SubmissionCreate = Schemas["SubmissionCreate"];
type PropertyCategory = Schemas["PropertyCategory"];
type Furnishing = Schemas["Furnishing"];
type ConstructionStatus = Schemas["ConstructionStatus"];

// Option values are pinned to the contract enums via `satisfies`: if the backend
// enum changes, the regenerated type makes this fail to compile.
export const CATEGORY_OPTIONS = [
  { value: "houses", label: "Houses" },
  { value: "apartments", label: "Apartments" },
  { value: "villas", label: "Villas" },
  { value: "plots", label: "Plots" },
  { value: "commercial", label: "Commercial" },
] as const satisfies readonly { value: PropertyCategory; label: string }[];

export const FURNISHING_OPTIONS = [
  { value: "unfurnished", label: "Unfurnished" },
  { value: "semi", label: "Semi-furnished" },
  { value: "furnished", label: "Furnished" },
] as const satisfies readonly { value: Furnishing; label: string }[];

export const CONSTRUCTION_OPTIONS = [
  { value: "ready", label: "Ready to move" },
  { value: "under_construction", label: "Under construction" },
] as const satisfies readonly { value: ConstructionStatus; label: string }[];

export type DetailRow = { key: string; value: string };

export type SubmitFormState = {
  title: string;
  type: string;
  location: string;
  meta: string;
  image: string;
  category: PropertyCategory | "";
  city: string;
  locality: string;
  pincode: string;
  priceRupees: string;
  bhk: string;
  area_sqft: string;
  furnishing: Furnishing | "";
  constructionStatus: ConstructionStatus | "";
  amenities: string[];
  age_years: string;
  rera_number: string;
  details: DetailRow[];
};

export const EMPTY_FORM: SubmitFormState = {
  title: "",
  type: "",
  location: "",
  meta: "",
  image: "",
  category: "",
  city: "",
  locality: "",
  pincode: "",
  priceRupees: "",
  bhk: "",
  area_sqft: "",
  furnishing: "",
  constructionStatus: "",
  amenities: [],
  age_years: "",
  rera_number: "",
  details: [],
};

function toInt(value: string): number {
  const n = Number.parseInt(value.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function orNull(value: string): string | null {
  const t = value.trim();
  return t === "" ? null : t;
}

export function buildSubmissionPayload(form: SubmitFormState): SubmissionCreate {
  const details: Record<string, unknown> = {};
  for (const row of form.details) {
    const key = row.key.trim();
    if (key !== "") details[key] = row.value.trim();
  }
  return {
    title: form.title.trim(),
    type: form.type.trim(),
    location: form.location.trim(),
    meta: orNull(form.meta),
    image: orNull(form.image),
    category: form.category as PropertyCategory,
    city: form.city.trim(),
    locality: form.locality.trim(),
    pincode: form.pincode.trim(),
    price_paise: Math.round(Number.parseFloat(form.priceRupees.trim()) * 100),
    bhk: toInt(form.bhk),
    area_sqft: toInt(form.area_sqft),
    furnishing: form.furnishing as Furnishing,
    construction_status: form.constructionStatus as ConstructionStatus,
    amenities: form.amenities,
    age_years: toInt(form.age_years),
    rera_number: form.rera_number.trim(),
    details,
  };
}

export function validateForm(form: SubmitFormState): Record<string, string> {
  const errs: Record<string, string> = {};
  const required: [keyof SubmitFormState, string][] = [
    ["title", "Title is required."],
    ["type", "Type is required."],
    ["location", "Location is required."],
    ["city", "City is required."],
    ["locality", "Locality is required."],
    ["category", "Choose a category."],
    ["furnishing", "Choose a furnishing."],
    ["constructionStatus", "Choose a construction status."],
    ["rera_number", "RERA number is required."],
  ];
  for (const [field, msg] of required) {
    if (String(form[field]).trim() === "") errs[field] = msg;
  }
  if (!/^\d{6}$/.test(form.pincode.trim())) errs.pincode = "Pincode must be 6 digits.";
  const price = Number.parseFloat(form.priceRupees.trim());
  if (!Number.isFinite(price) || price <= 0) errs.priceRupees = "Enter a price greater than 0.";
  return errs;
}
