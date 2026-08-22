"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CONFIGURATION_OPTIONS,
  CONSTRUCTION_OPTIONS,
  FACING_OPTIONS,
  FURNISHING_OPTIONS,
  YES_NO_UNKNOWN_OPTIONS,
  propertyFormFamily,
  type PropertyDetailForm,
  type SubmitFormState,
} from "@/lib/property-submit";

type Props = {
  form: SubmitFormState;
  errors: Record<string, string>;
  setField: <K extends keyof SubmitFormState>(field: K, value: SubmitFormState[K]) => void;
  setDetailField: <K extends keyof PropertyDetailForm>(
    field: K,
    value: PropertyDetailForm[K],
  ) => void;
};

function ErrorText({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="mt-1 text-sm text-destructive" role="alert">
      {message}
    </p>
  ) : null;
}

function Field({
  id,
  label,
  value,
  onChange,
  error,
  type = "text",
  suffix,
  optional = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: "text" | "number" | "date";
  suffix?: string;
  optional?: boolean;
}) {
  const errorId = `${id}-error`;
  return (
    <div>
      <Label htmlFor={id}>
        {label}{optional ? " (optional)" : ""}
      </Label>
      <div className="relative">
        <Input
          id={id}
          name={id}
          type={type}
          min={type === "number" ? "0" : undefined}
          step={type === "number" ? "any" : undefined}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={suffix ? "pr-16" : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
        />
        {suffix ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-text-secondary">
            {suffix}
          </span>
        ) : null}
      </div>
      <ErrorText id={errorId} message={error} />
    </div>
  );
}

function Choice({
  id,
  label,
  value,
  onChange,
  options,
  error,
  optional = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  error?: string;
  optional?: boolean;
}) {
  const errorId = `${id}-error`;
  return (
    <div>
      <Label htmlFor={id}>{label}{optional ? " (optional)" : ""}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
        >
          <SelectValue placeholder="Choose an option" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ErrorText id={errorId} message={error} />
    </div>
  );
}

function Narrative({
  id,
  label,
  value,
  onChange,
  maxWords,
  minWords = 0,
  error,
  optional = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxWords: number;
  minWords?: number;
  error?: string;
  optional?: boolean;
}) {
  const words = value.trim() ? value.trim().split(/\s+/).length : 0;
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;
  return (
    <div className="sm:col-span-2">
      <Label htmlFor={id}>{label}{optional ? " (optional)" : ""}</Label>
      <Textarea
        id={id}
        name={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        aria-invalid={Boolean(error)}
        aria-describedby={`${helpId}${error ? ` ${errorId}` : ""}`}
      />
      <div
        id={helpId}
        className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-text-secondary"
      >
        <span>Do not include numbers, links, email addresses, or markup.</span>
        <span>
          {minWords > 0
            ? `${words} words · ${minWords}–${maxWords} required`
            : `${words}/${maxWords} words`}
        </span>
      </div>
      <ErrorText id={errorId} message={error} />
    </div>
  );
}

const SALE_OPTIONS = [
  { value: "new_sale", label: "New sale" },
  { value: "resale", label: "Resale" },
] as const;

function ApprovalFields({ form, errors, setDetailField }: Pick<Props, "form" | "errors" | "setDetailField">) {
  return (
    <>
      <Field
        id="approval-authority"
        label="Local approval authority"
        value={form.details.approvalAuthority}
        onChange={(value) => setDetailField("approvalAuthority", value)}
        error={errors.approvalAuthority}
        optional
      />
      <Field
        id="approval-reference"
        label="Local approval reference"
        value={form.details.approvalReference}
        onChange={(value) => setDetailField("approvalReference", value)}
        error={errors.approvalReference}
        optional
      />
    </>
  );
}

export function PropertyDetailFields({ form, errors, setField, setDetailField }: Props) {
  const family = propertyFormFamily(form.propertySubtype);
  const d = form.details;
  if (!family) {
    return (
      <section className="rounded-xl border border-dashed border-border bg-muted/20 p-5 text-sm text-text-secondary">
        Choose a property type to see the required listing details.
      </section>
    );
  }

  return (
    <>
      <section className="grid gap-4 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-2 sm:p-5">
        <div className="sm:col-span-2">
          <h2 className="text-sm font-semibold text-text-primary">Property details</h2>
          <p className="mt-0.5 text-xs text-text-secondary">
            These fields are tailored to the selected property type and will be reviewed before publication.
          </p>
        </div>

        {family === "project" ? (
          <>
            <Field id="project-name" label="Project name" value={d.projectName} onChange={(value) => setDetailField("projectName", value)} error={errors.projectName} />
            <Field id="project-area" label="Project area" suffix="acres" type="number" value={d.projectAreaAcres} onChange={(value) => setDetailField("projectAreaAcres", value)} error={errors.projectAreaAcres} />
            <Field id="tower-count" label="Number of towers" type="number" value={d.numberOfTowers} onChange={(value) => setDetailField("numberOfTowers", value)} error={errors.numberOfTowers} />
            <Field id="unit-count" label="Total units" type="number" value={d.totalUnits} onChange={(value) => setDetailField("totalUnits", value)} error={errors.totalUnits} />
            <div className="sm:col-span-2">
              <Label>Available configurations</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {CONFIGURATION_OPTIONS.map((option) => {
                  const selected = d.configurations.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setDetailField(
                        "configurations",
                        selected
                          ? d.configurations.filter((value) => value !== option.value)
                          : [...d.configurations, option.value],
                      )}
                      className={`rounded-full border px-3 py-1.5 text-sm ${selected ? "border-brand-cta bg-brand-cta/10 text-text-primary" : "border-border text-text-secondary"}`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <ErrorText id="configurations-error" message={errors.configurations} />
            </div>
            <Field id="unit-area" label="Unit or plot area" suffix="sq ft" type="number" value={d.unitAreaSqft} onChange={(value) => setDetailField("unitAreaSqft", value)} error={errors.unitAreaSqft} />
            <Field id="uds-area" label="Undivided share" suffix="sq ft" type="number" value={d.udsSqft} onChange={(value) => setDetailField("udsSqft", value)} error={errors.udsSqft} optional />
            <Field id="price-per-sqft" label="Price per square foot" suffix="₹" type="number" value={d.rateRupees} onChange={(value) => setDetailField("rateRupees", value)} error={errors.rateRupees} />
            <Choice id="sale-type" label="Sale type" value={d.saleType} onChange={(value) => setDetailField("saleType", value)} options={SALE_OPTIONS} error={errors.saleType} />
            <Choice id="plot-facing" label="Plot facing" value={d.plotFacing} onChange={(value) => setDetailField("plotFacing", value)} options={FACING_OPTIONS} error={errors.plotFacing} optional />
            <Choice id="entrance-facing" label="Entrance facing" value={d.facing} onChange={(value) => setDetailField("facing", value)} options={FACING_OPTIONS} error={errors.facing} />
            <Field id="handover" label="Expected handover date" type="date" value={d.expectedHandoverDate} onChange={(value) => setDetailField("expectedHandoverDate", value)} error={errors.expectedHandoverDate} optional={form.constructionStatus !== "under_construction"} />
            <ApprovalFields form={form} errors={errors} setDetailField={setDetailField} />
            <Narrative id="amenities-description" label="Amenities description" value={d.amenitiesDescription} onChange={(value) => setDetailField("amenitiesDescription", value)} minWords={150} maxWords={500} error={errors.amenitiesDescription} />
            <Narrative id="about-project" label="About the project" value={d.about} onChange={(value) => setDetailField("about", value)} maxWords={500} error={errors.about} />
          </>
        ) : null}

        {family === "individual" ? (
          <>
            <Choice id="property-use" label="Property use" value={d.propertyUse} onChange={(value) => setDetailField("propertyUse", value)} options={[{ value: "residential", label: "Residential" }, { value: "residential_commercial", label: "Residential and commercial" }]} error={errors.propertyUse} />
            <Field id="land-area" label="Total land area" type="number" value={d.totalLandArea} onChange={(value) => setDetailField("totalLandArea", value)} error={errors.totalLandArea} />
            <Choice id="land-area-unit" label="Land area unit" value={d.landAreaUnit} onChange={(value) => setDetailField("landAreaUnit", value)} options={[{ value: "sqft", label: "Square feet" }, { value: "sqyd", label: "Square yards" }]} error={errors.landAreaUnit} />
            <Field id="built-up-area" label="Built-up area" suffix="sq ft" type="number" value={d.unitAreaSqft} onChange={(value) => setDetailField("unitAreaSqft", value)} error={errors.unitAreaSqft} />
            <Field id="floor-count" label="Number of floors" type="number" value={d.numberOfFloors} onChange={(value) => setDetailField("numberOfFloors", value)} error={errors.numberOfFloors} />
            <Choice id="individual-facing" label="Facing" value={d.facing} onChange={(value) => setDetailField("facing", value)} options={FACING_OPTIONS} error={errors.facing} />
            <Field id="rental-income" label="Monthly rental income" suffix="₹" type="number" value={d.monthlyRentalIncomeRupees} onChange={(value) => setDetailField("monthlyRentalIncomeRupees", value)} error={errors.monthlyRentalIncomeRupees} optional />
            <Choice id="individual-loan" label="Ongoing loan" value={d.ongoingLoanStatus} onChange={(value) => setDetailField("ongoingLoanStatus", value)} options={YES_NO_UNKNOWN_OPTIONS} error={errors.ongoingLoanStatus} />
            <Narrative id="individual-about" label="About the property" value={d.about} onChange={(value) => setDetailField("about", value)} maxWords={250} error={errors.about} />
            <Narrative id="individual-other" label="Additional information" value={d.otherInformation} onChange={(value) => setDetailField("otherInformation", value)} maxWords={250} error={errors.otherInformation} optional />
          </>
        ) : null}

        {family === "commercial" ? (
          <>
            <Choice id="ownership" label="Ownership type" value={d.ownershipType} onChange={(value) => setDetailField("ownershipType", value)} options={[{ value: "individual", label: "Individual" }, { value: "entity", label: "Business entity" }]} error={errors.ownershipType} />
            <Field id="commercial-total-area" label="Total area" suffix="sq ft" type="number" value={d.totalAreaSqft} onChange={(value) => setDetailField("totalAreaSqft", value)} error={errors.totalAreaSqft} />
            <Field id="commercial-unit-area" label="Unit area" suffix="sq ft" type="number" value={d.unitAreaSqft} onChange={(value) => setDetailField("unitAreaSqft", value)} error={errors.unitAreaSqft} />
            <Choice id="commercial-facing" label="Facing" value={d.facing} onChange={(value) => setDetailField("facing", value)} options={FACING_OPTIONS} error={errors.facing} />
            <Choice id="commercial-sale-type" label="Sale type" value={d.saleType} onChange={(value) => setDetailField("saleType", value)} options={SALE_OPTIONS} error={errors.saleType} />
            <Choice id="income-start" label="Rental income starts" value={d.rentalIncomeStart} onChange={(value) => setDetailField("rentalIncomeStart", value)} options={[{ value: "immediate", label: "From day one" }, { value: "from_handover", label: "From handover" }, { value: "not_applicable", label: "Not applicable" }]} error={errors.rentalIncomeStart} />
            <Field id="commercial-income" label="Monthly rental income" suffix="₹" type="number" value={d.monthlyRentalIncomeRupees} onChange={(value) => setDetailField("monthlyRentalIncomeRupees", value)} error={errors.monthlyRentalIncomeRupees} optional />
            <ApprovalFields form={form} errors={errors} setDetailField={setDetailField} />
            <Narrative id="commercial-amenities" label="Amenities description" value={d.amenitiesDescription} onChange={(value) => setDetailField("amenitiesDescription", value)} maxWords={150} error={errors.amenitiesDescription} optional />
            <Narrative id="commercial-about" label="About the property" value={d.about} onChange={(value) => setDetailField("about", value)} maxWords={250} error={errors.about} />
            <Narrative id="commercial-other" label="Additional information" value={d.otherInformation} onChange={(value) => setDetailField("otherInformation", value)} maxWords={250} error={errors.otherInformation} optional />
          </>
        ) : null}

        {family === "plot" ? (
          <>
            <Field id="plot-project-name" label="Project name" value={d.projectName} onChange={(value) => setDetailField("projectName", value)} error={errors.projectName} />
            <Field id="plot-project-area" label="Total project area" suffix="acres" type="number" value={d.totalProjectAreaAcres} onChange={(value) => setDetailField("totalProjectAreaAcres", value)} error={errors.totalProjectAreaAcres} />
            <Field id="plot-size" label="Plot size" suffix="sq yd" type="number" value={d.plotSizeSqyd} onChange={(value) => setDetailField("plotSizeSqyd", value)} error={errors.plotSizeSqyd} />
            <Field id="total-plots" label="Total plots" type="number" value={d.totalPlots} onChange={(value) => setDetailField("totalPlots", value)} error={errors.totalPlots} />
            <Choice id="plot-facing-choice" label="Facing" value={d.facing} onChange={(value) => setDetailField("facing", value)} options={FACING_OPTIONS} error={errors.facing} />
            <Field id="price-per-sqyd" label="Price per square yard" suffix="₹" type="number" value={d.rateRupees} onChange={(value) => setDetailField("rateRupees", value)} error={errors.rateRupees} />
            <Choice id="plot-sale-type" label="Sale type" value={d.saleType} onChange={(value) => setDetailField("saleType", value)} options={SALE_OPTIONS} error={errors.saleType} />
            <Choice id="project-status" label="Project status" value={d.projectStatus} onChange={(value) => setDetailField("projectStatus", value)} options={[{ value: "under_development", label: "Under development" }, { value: "completed", label: "Completed" }]} error={errors.projectStatus} />
            <ApprovalFields form={form} errors={errors} setDetailField={setDetailField} />
            <Narrative id="plot-amenities" label="Amenities description" value={d.amenitiesDescription} onChange={(value) => setDetailField("amenitiesDescription", value)} maxWords={150} error={errors.amenitiesDescription} optional />
            <Narrative id="plot-about" label="About the project" value={d.about} onChange={(value) => setDetailField("about", value)} maxWords={500} error={errors.about} />
            <Narrative id="plot-other" label="Additional information" value={d.otherInformation} onChange={(value) => setDetailField("otherInformation", value)} maxWords={250} error={errors.otherInformation} optional />
          </>
        ) : null}

        {family === "agricultural" ? (
          <>
            <Field id="agricultural-area" label="Land area" type="number" value={d.landArea} onChange={(value) => setDetailField("landArea", value)} error={errors.landArea} />
            <Choice id="agricultural-unit" label="Land area unit" value={d.agriculturalAreaUnit} onChange={(value) => setDetailField("agriculturalAreaUnit", value)} options={[{ value: "acres", label: "Acres" }, { value: "guntas", label: "Guntas" }]} error={errors.agriculturalAreaUnit} />
            <Field id="title-details" label="Land title details" value={d.titleDetails} onChange={(value) => setDetailField("titleDetails", value)} error={errors.titleDetails} />
            <Choice id="agricultural-loan" label="Ongoing loan" value={d.ongoingLoanStatus} onChange={(value) => setDetailField("ongoingLoanStatus", value)} options={YES_NO_UNKNOWN_OPTIONS} error={errors.ongoingLoanStatus} />
            <Field id="land-type" label="Land type" value={d.landType} onChange={(value) => setDetailField("landType", value)} error={errors.landType} />
            <Field id="survey-number" label="Survey number" value={d.surveyNumber} onChange={(value) => setDetailField("surveyNumber", value)} error={errors.surveyNumber} />
            <Choice id="rythu-bandhu" label="Rythu Bandhu" value={d.rythuBandhuStatus} onChange={(value) => setDetailField("rythuBandhuStatus", value)} options={YES_NO_UNKNOWN_OPTIONS} error={errors.rythuBandhuStatus} />
            <Field id="registration-district" label="Registration district" value={d.registrationDistrict} onChange={(value) => setDetailField("registrationDistrict", value)} error={errors.registrationDistrict} />
            <Field id="sub-registrar" label="Sub-Registrar Office" value={d.subRegistrarOffice} onChange={(value) => setDetailField("subRegistrarOffice", value)} error={errors.subRegistrarOffice} />
            <Narrative id="agricultural-other" label="Additional information" value={d.otherInformation} onChange={(value) => setDetailField("otherInformation", value)} maxWords={250} error={errors.otherInformation} optional />
          </>
        ) : null}

        {family === "project" || family === "commercial" ? (
          <>
            <Choice id="furnishing" label="Furnishing" value={form.furnishing} onChange={(value) => setField("furnishing", value as SubmitFormState["furnishing"])} options={FURNISHING_OPTIONS} error={errors.furnishing} />
            <Choice id="construction" label="Construction status" value={form.constructionStatus} onChange={(value) => setField("constructionStatus", value as SubmitFormState["constructionStatus"])} options={CONSTRUCTION_OPTIONS} error={errors.constructionStatus} />
          </>
        ) : null}
      </section>

      <section className="grid gap-4 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-2 sm:p-5">
        <div className="sm:col-span-2">
          <h2 className="text-sm font-semibold text-text-primary">RERA applicability</h2>
          <p className="mt-0.5 text-xs text-text-secondary">The registration number is optional. An Admin independently records the verification result before approval.</p>
        </div>
        <Choice
          id="rera-applicability"
          label="RERA status for this property"
          value={form.reraApplicability}
          onChange={(value) => setField("reraApplicability", value as SubmitFormState["reraApplicability"])}
          options={[
            { value: "applicable", label: "RERA applies" },
            { value: "exemption_claimed", label: "Exemption claimed" },
            { value: "unsure", label: "Not sure" },
          ]}
          error={errors.reraApplicability}
        />
        <Field id="rera-number" label="RERA registration number" value={form.reraNumber} onChange={(value) => setField("reraNumber", value)} error={errors.reraNumber} optional />
      </section>
    </>
  );
}
