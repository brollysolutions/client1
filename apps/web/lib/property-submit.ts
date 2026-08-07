// Pure form-state -> SubmissionCreate builder + contract-pinned option lists for
// the agent property-submit form. Kept separate from the component so the ₹->paise
// conversion and validation are unit-tested (the one place a bug corrupts catalog data).
import type { components } from "@contracts/generated/schema";

type Schemas = components["schemas"];
type SubmissionCreate = Schemas["SubmissionCreate"];
type PropertyCategory = Schemas["PropertyCategory"];
type Furnishing = Schemas["Furnishing"];
type ConstructionStatus = Schemas["ConstructionStatus"];
type SubmissionMediaInput = Schemas["SubmissionMediaInput"];

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
  images: File[];
  documents: File[];
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
  images: [],
  documents: [],
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

export function buildSubmissionPayload(
  form: SubmitFormState,
  media: SubmissionMediaInput[],
): SubmissionCreate {
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
    media,
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
  if (form.images.length < 1 || form.images.length > 10) {
    errs.images = "Choose between 1 and 10 property images.";
  }
  if (form.documents.length > 2) errs.documents = "Choose at most 2 PDF documents.";
  const maxBytes = 5 * 1024 * 1024;
  const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (form.images.some((file) => !imageTypes.has(file.type))) {
    errs.images = "Images must be JPEG, PNG, or WebP.";
  } else if (form.images.some((file) => file.size > maxBytes)) {
    errs.images = "Each image must be 5 MiB or smaller.";
  }
  if (form.documents.some((file) => file.type !== "application/pdf")) {
    errs.documents = "Reviewer documents must be PDFs.";
  } else if (form.documents.some((file) => file.size > maxBytes)) {
    errs.documents = "Each PDF must be 5 MiB or smaller.";
  }
  return errs;
}
